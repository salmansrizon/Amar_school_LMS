# Student password provisioning without a service-role key

Research for [#437](https://github.com/salmansrizon/Amar_school_LMS/issues/437) (child of the
Student Portal map, [#434](https://github.com/salmansrizon/Amar_school_LMS/issues/434)).

**Question.** A School Owner must be able to create a Student login and set/reset its password
from the student's profile page. The derived login address has no inbox, so Supabase's
self-service `resetPasswordForEmail` recovery is unusable. The supported admin path,
`supabase.auth.admin.updateUserById`, requires a service-role key, and this project deliberately
has none ([#24](https://github.com/salmansrizon/Amar_school_LMS/issues/24): "anon +
self-gating SECURITY DEFINER RPCs — intentional").

**Method.** Every claim below is traced to one of three primary sources: the official Supabase
docs, the GoTrue source at `github.com/supabase/auth` (`master`, read 2026-08-23), or a live
Supabase Postgres 17.4 instance whose `auth` schema is at migration `20260625000000` — the newest
migration in the upstream repo, so the live schema is current. Queries against the live schema
were read-only (`information_schema`, `pg_catalog`, `gen_salt`).

> **Caveat on the live-schema evidence.** The Supabase MCP connection available to this agent
> exposed exactly one project (`llmeentlxjauihrkkrjg`), which is *not* the Amar School LMS
> database — it lacks `public.schools`. The `auth` schema is created and migrated by GoTrue
> itself and is identical across projects on the same auth version, so the column/grant/index
> facts below transfer; the `public`-schema facts come from this repo's migrations instead.
> Nothing here depends on data unique to the LMS project.

---

## TL;DR

Yes — and the project already does it, twice, at runtime.

Writing `auth.users.encrypted_password` from a `SECURITY DEFINER` RPC works, is not forbidden by
Supabase, and this repo has shipped exactly that pattern since migration `0002`
(`create_staff_user`) and `0006` (`create_vendor_user`), with an integration test asserting the
resulting login authenticates. Extending it to Students is a small, consistent step.

But it is *tolerated*, not *supported*: Supabase's own docs warn that "columns, indices,
constraints or other database objects managed by Supabase may change at any time" and GoTrue has
already made one rename that would have silently broken hand-written SQL. Three concrete defects
exist in the current implementation (bcrypt cost 6 instead of 10; no session revocation on
password change; no password-policy enforcement), and all three are fixable in SQL.

The best-supported alternative — a **Supabase Edge Function** using the platform-injected
`SUPABASE_SERVICE_ROLE_KEY` — is genuinely free, and notably requires the key to be **stored
nowhere**: the platform injects it into the function's environment. That is a real refinement of
the no-service-role-key stance rather than an abandonment of it.

---

## 1. Can a `SECURITY DEFINER` RPC write `auth.users.encrypted_password`?

### It works, and here is exactly why

`auth.users` is owned by `supabase_auth_admin` and has RLS enabled with **zero policies**:

```
relname | relrowsecurity | relforcerowsecurity | owner
users   | true           | false               | supabase_auth_admin
```
<sub>live `pg_class` / `pg_namespace`</sub>

RLS was switched on by GoTrue migration
[`20240612123726_enable_rls_update_grants.up.sql`](https://github.com/supabase/auth/blob/master/migrations/20240612123726_enable_rls_update_grants.up.sql).
With RLS on and no policies, any role without `BYPASSRLS` sees nothing. But:

```
rolname             | rolsuper | rolbypassrls
anon                | false    | false
authenticated       | false    | false
postgres            | false    | true      <-- BYPASSRLS
service_role        | false    | true
supabase_auth_admin | false    | false
```
<sub>live `pg_roles`</sub>

and `postgres` holds full DML on `auth.users`:

```
grantor             | grantee  | privilege_type | is_grantable
supabase_auth_admin | postgres | SELECT         | YES
supabase_auth_admin | postgres | INSERT         | NO
supabase_auth_admin | postgres | UPDATE         | NO
supabase_auth_admin | postgres | DELETE         | NO
supabase_auth_admin | postgres | TRUNCATE       | NO
supabase_auth_admin | postgres | TRIGGER        | NO
supabase_auth_admin | postgres | REFERENCES     | NO
```
<sub>live `information_schema.role_table_grants`. `anon`, `authenticated` and `service_role`
have **no** grants on `auth.users` at all — `service_role`'s access comes purely from
`BYPASSRLS` plus GoTrue's REST API, not from table grants.</sub>

A `SECURITY DEFINER` function executes as its **owner**. Migrations applied by the Supabase CLI or
the SQL editor create functions owned by `postgres`, so the function body runs with `postgres`'s
`BYPASSRLS` and `INSERT`/`UPDATE` grants. That is the whole mechanism. The anon key never touches
`auth.users`; it only calls a function whose first statement is a role check.

### Note the asymmetry in that grant table

GoTrue's own migration grants `postgres` **only `SELECT`, and only that one `WITH GRANT OPTION`**.
The `INSERT`/`UPDATE`/`DELETE` privileges are a separate, non-grantable grant that comes from the
Supabase platform's bootstrap, not from anything upstream declares. Read that as a signal: the
project that owns the schema considers `postgres`'s access to `auth.users` to be read-only. The
write privileges are legacy compatibility, and they are the single thing this whole approach rests
on. If Supabase ever revokes them, every RPC below fails at once — loudly, at migration or call
time, not silently.

### The project already relies on this at runtime, not just for seeding

The ticket framed `0054_demo_school_seed.sql` as the precedent. It is the weaker one. Two
**runtime** RPCs already do this:

| Function | Migration | Caller | Creates |
|---|---|---|---|
| `public.create_staff_user(text, text, text)` | `web/supabase/migrations/0002_staff_permissions.sql` | School Owner | `auth.users` + `auth.identities` + `profiles` |
| `public.create_vendor_user(text, text, text, app_role)` | `web/supabase/migrations/0006_territory_assignments.sql` | Super Admin | `auth.users` + `auth.identities` + `profiles` |

Both carry the same in-repo caveat, written at the time:

> `-- ponytail: creates the auth user via direct SQL (like seed-test.sql) instead of the GoTrue`
> `-- Admin API — swap to a service-role admin call if GoTrue's internal schema changes ever break this.`

And `web/tests/integration/staff-permissions.test.ts` asserts the outcome directly:
`it('created staff user can log in and sees their own school-scoped profile', …)`. So the runtime
question the ticket asks — does a SQL-written row authenticate through GoTrue? — is already
answered *yes* by this repo's own test suite, not merely by the seed.

**Conclusion for Q1: the mechanism is proven at runtime, not just at seed time. A student
password RPC is not new architecture; it is the third instance of an existing pattern.**

---

## 2. What else does GoTrue read? What breaks now, and what breaks later?

### The `User` struct is the contract

From [`internal/models/user.go`](https://github.com/supabase/auth/blob/master/internal/models/user.go),
these fields are **non-pointer Go types**. Postgres `NULL` in any of them fails the row scan:

```go
Aud                      string     `db:"aud"`
Role                     string     `db:"role"`
ConfirmationToken        string     `db:"confirmation_token"`
RecoveryToken            string     `db:"recovery_token"`
EmailChangeTokenCurrent  string     `db:"email_change_token_current"`
EmailChangeTokenNew      string     `db:"email_change_token_new"`
EmailChange              string     `db:"email_change"`
PhoneChangeToken         string     `db:"phone_change_token"`
PhoneChange              string     `db:"phone_change"`
EmailChangeConfirmStatus int        `db:"email_change_confirm_status"`
CreatedAt                time.Time  `db:"created_at"`
UpdatedAt                time.Time  `db:"updated_at"`
IsSSOUser                bool       `db:"is_sso_user"`
IsAnonymous              bool       `db:"is_anonymous"`
DONTUSEINSTANCEID        uuid.UUID  `db:"instance_id"`
```

Nullable-safe (pointer / `NullString`): `EncryptedPassword *string`, `EmailConfirmedAt *time.Time`,
`BannedUntil *time.Time`, `DeletedAt *time.Time`, `Email storage.NullString`,
`Phone storage.NullString`, `ConfirmedAt *time.Time` (and note its tag `rw:"r"` — read-only).

Supabase documents this failure mode by name. From
[*Auth error: '500: Database error querying schema'*](https://supabase.com/docs/guides/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44):

> "the Supabase Auth server has encountered `NULL` values in the `auth.users` table where a valid
> string or empty string is expected" … "This typically happens following manual SQL inserts or
> updates to the `auth.users` table." … "ensure that any future manual modifications to the `auth`
> schema adhere to the service's requirements"

That page matters for the "is it supported?" question: Supabase does not tell you not to do it.
It tells you how to do it correctly and how to repair it.

**Crucially, the live schema has no defaults for four of those columns** —
`confirmation_token`, `recovery_token`, `email_change_token_new`, and `email_change` are all
`is_nullable = YES, column_default = NULL`. An `INSERT` that omits them writes `NULL` and the
account becomes unloginnable with a 500. This is precisely why `create_staff_user` lists all eight
token columns and sets them to `''`. **Do not drop any of them from a new RPC.**

Writing `''` is safe under the partial unique indexes, and it is worth understanding why:

```sql
CREATE UNIQUE INDEX confirmation_token_idx ON auth.users (confirmation_token)
  WHERE ((confirmation_token)::text !~ '^[0-9 ]*$');
```
<sub>live `pg_indexes`; identical shape for `recovery_token_idx`, `email_change_token_new_idx`,
`email_change_token_current_idx`, `reauthentication_token_idx`</sub>

`''` matches `^[0-9 ]*$` (zero or more digits/spaces), so empty strings are **excluded from the
index** and any number of rows may share them. That is a deliberate upstream accommodation.

### The lookup query pins three more columns

```go
func FindUserByEmailAndAudience(tx *storage.Connection, email, aud string) (*User, error) {
	return findUser(tx, "instance_id = ? and LOWER(email) = ? and aud = ? and is_sso_user = false",
		uuid.Nil, strings.ToLower(email), aud)
}
```

- `instance_id` **must** be `00000000-0000-0000-0000-000000000000` (`uuid.Nil`). Not `NULL`.
  A row with a null `instance_id` is simply never found — login fails as "invalid credentials",
  with no clue why.
- `aud` must equal the configured audience, i.e. `'authenticated'`.
- `is_sso_user` must be `false` (DB default, so safe).
- `email` is matched case-insensitively; the existing RPCs already `lower()` it, and the
  `users_email_partial_key` unique index (`WHERE is_sso_user = false`) is on the raw column, so
  storing lowercase consistently is what keeps duplicates out.

### The password grant's own gates

From [`internal/api/token.go`](https://github.com/supabase/auth/blob/master/internal/api/token.go),
`ResourceOwnerPasswordGrant` checks, in order: `user.HasPassword()`, `user.IsBanned()`,
`user.Authenticate(...)`, then `!user.IsConfirmed()` for email logins.

```go
func (u *User) IsConfirmed() bool { return u.EmailConfirmedAt != nil }

func (u *User) IsBanned() bool {
	if u.BannedUntil == nil { return false }
	return time.Now().Before(*u.BannedUntil)
}
```

Answering the ticket's list precisely:

| Column | Read at login? | Safe value | Failure if wrong |
|---|---|---|---|
| `encrypted_password` | yes | bcrypt `$2a$` hash | nil/empty ⇒ invalid credentials |
| `email_confirmed_at` | yes (`IsConfirmed`) | `now()` | `NULL` ⇒ **"Email not confirmed"** |
| `confirmed_at` | no | **never write it** | generated column ⇒ INSERT error |
| `banned_until` | yes (`IsBanned`) | `NULL` | future timestamp ⇒ "User is banned" |
| `instance_id` | yes (WHERE clause) | all-zero UUID | `NULL` ⇒ user never found |
| `aud` | yes (WHERE clause) | `'authenticated'` | mismatch ⇒ user never found; `NULL` ⇒ scan error |
| `is_sso_user` | yes (WHERE clause) | `false` (default) | — |
| `recovery_token`, `email_change`, and the six other token columns | scanned | `''` | `NULL` ⇒ 500 Database error querying schema |
| `role` | scanned | `'authenticated'` | `NULL` ⇒ scan error |
| `created_at`, `updated_at` | scanned | `now()` | `NULL` ⇒ scan error |
| `deleted_at`, `is_anonymous` | not gated at password grant | `NULL` / `false` | — |

`confirmed_at` deserves its own line. It has been
`GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED` since GoTrue migration
[`20210722035447_adds_confirmed_at.up.sql`](https://github.com/supabase/auth/blob/master/migrations/20210722035447_adds_confirmed_at.up.sql),
confirmed on the live schema. Any `INSERT` or `UPDATE` naming it raises
`cannot insert a non-DEFAULT value into column "confirmed_at"`. Set `email_confirmed_at`; the
generated column follows. Both existing migrations get this right.

### `auth.identities`

Not read by the password grant, but `findUser` calls `tx.Eager()`, and `User.Identities` is tagged
`has_many:"identities"`, so GoTrue loads them on every user fetch. A user with no identity row can
still log in, but:

- `identities` is what populates `user.identities` in the client SDK response and the Dashboard's
  provider column;
- `auth.identities.email` is itself `GENERATED ALWAYS AS (lower(identity_data ->> 'email')) STORED`
  (live schema), so `identity_data` **must** contain the email or that generated column is `NULL`;
- `identities_provider_id_provider_unique` on `(provider_id, provider)` means `provider_id` must be
  unique per provider. The existing RPCs use the new user's own UUID as `provider_id`, which is
  what GoTrue does for the `email` provider.

**Write the identity row.** Skipping it produces a user that logs in today but is invisible to
identity-linking, `updateUser({ email })`, and future GoTrue features.

### Will a future Supabase upgrade break this? It already did once.

GoTrue migration
[`20231117164230_add_id_pkey_identities.up.sql`](https://github.com/supabase/auth/blob/master/migrations/20231117164230_add_id_pkey_identities.up.sql):

```sql
alter table auth.identities rename column id to provider_id;
alter table auth.identities
    drop constraint if exists identities_pkey,
    add column if not exists id uuid default gen_random_uuid() primary key;
```

Any hand-written `insert into auth.identities (id, user_id, ...)` authored before November 2023
kept running afterwards, but `id` now meant something completely different — a *silent* semantic
break, not an error. That is the sharpest available answer to "does this break on a later upgrade":
**it is not hypothetical, it has happened, and the failure was silent.** (This repo's migrations
use the post-rename shape and are correct today.)

Additive changes have been kinder: `is_anonymous` arrived as
`boolean not null default false`, and `deleted_at`, `is_sso_user`, `email_change_confirm_status`
all carry defaults, so hand-written inserts survived them. The live auth schema is at
`20260625000000` and the recent migrations are all in OAuth/passkey/WebAuthn territory
(`oauth_clients`, `webauthn_credentials`, `custom_oauth_providers`) — nothing near the
email/password columns. The near-term risk is low; the long-term risk is real and is a *silent*
risk, which is the bad kind.

Supabase states the general rule itself, in
[User Management](https://supabase.com/docs/guides/auth/managing-user-data):

> "Primary keys are guaranteed not to change. Columns, indices, constraints or other database
> objects managed by Supabase may change at any time and you should be careful when referencing
> them directly."

and in [Auth architecture](https://supabase.com/docs/guides/auth/architecture):

> "Supabase Auth uses the `auth` schema in your Postgres database to store user tables and other
> information. For security, this schema is not exposed on the auto-generated API."

### Three defects in the current implementation

These apply to `create_staff_user` and `create_vendor_user` today, and must not be copied forward.

**(a) bcrypt cost 6, not 10.** Verified on the live database:

```
default_bf_salt_prefix | bf10_prefix | default_hash_prefix
$2a$06$                | $2a$10$     | $2a$06$
```

`gen_salt('bf')` defaults to **6 rounds**. GoTrue hashes at `bcrypt.DefaultCost`, which is
**10** ([`internal/crypto/password.go`](https://github.com/supabase/auth/blob/master/internal/crypto/password.go):
`hashCost := bcrypt.DefaultCost`). Every password this project has ever written from SQL is 16×
cheaper to brute-force than one GoTrue would have written.

Worse, GoTrue will not quietly repair it. From `Authenticate`:

```go
cost, err := bcrypt.Cost([]byte(hash))
if cost > bcrypt.DefaultCost || cost == bcrypt.MinCost {
    // re-hash
}
```

Cost 6 is neither `> 10` nor `== 4`, so it falls through the upgrade branch and stays at 6 forever.

> **Fix: use `extensions.gen_salt('bf', 10)` everywhere**, and backfill existing rows on next
> password change. Cheap, one-word change, closes a real gap. Do not go above 10 — `cost > 10`
> triggers GoTrue's re-hash branch on every successful login, adding write load.

**(b) A raw `UPDATE` does not revoke sessions.** GoTrue's own password change does:

```go
func (u *User) UpdatePassword(tx *storage.Connection, sessionID *uuid.UUID) error {
	u.ConfirmationToken = ""; u.RecoveryToken = ""
	u.EmailChangeTokenCurrent = ""; u.EmailChangeTokenNew = ""
	u.PhoneChangeToken = ""; u.ReauthenticationToken = ""
	// ... UpdateOnly(...) ...
	if err := ClearAllOneTimeTokensForUser(tx, u.ID); err != nil { return err }
	if sessionID == nil { return Logout(tx, u.ID) }        // <-- all sessions
	return LogoutAllExceptMe(tx, *sessionID, u.ID)
}
```

and `adminUserUpdate` in `internal/api/admin.go` calls `user.UpdatePassword(tx, nil)` — the
all-sessions form. [Supabase's sessions doc](https://supabase.com/docs/guides/auth/sessions) lists
"The user changes their password or performs a security sensitive action" as a termination
trigger, and notes that by default "refresh tokens never expire but can only be used once."

So: an Owner resets a compromised student's password with a bare SQL `UPDATE`, and whoever holds
the old session **stays logged in indefinitely**. For the specific scenario this feature exists to
serve — a student's login has leaked, the Owner resets it — that is a functional defect, not a nit.

> **Fix: the RPC must also `delete from auth.sessions where user_id = ...` and
> `delete from auth.refresh_tokens where user_id = ...`** (and `auth.one_time_tokens`, and
> `auth.mfa_amr_claims` which FKs to sessions). Order matters for the FKs; deleting sessions
> cascades where the constraints allow. Cover it with an integration test that signs in, resets,
> and asserts the old refresh token is rejected.

**(c) No password policy.** `signUp()` and `admin.updateUserById` enforce the project's configured
minimum length and required character classes. An RPC enforces only what you write. The existing
functions check `length(...) >= 8` and nothing else. Whatever the Auth settings say, mirror it in
the RPC, or the RPC becomes the weak door.

---

## 3. Does account **creation** need the same treatment, or can `signUp()` work?

`signUp()` is not viable here, for two independent reasons.

**Email confirmation.** This repo's own claim flow proves confirmations are on:

```ts
// web/app/claim/page.tsx
const { data, error } = await supabase.auth.signUp({ ... })
setPhase(data.session ? 'claim' : 'confirm-email')
```

The `'confirm-email'` branch only exists because `signUp()` can return without a session. A student
address with no inbox lands there permanently: `email_confirmed_at` stays `NULL`, `IsConfirmed()`
returns false, and `ResourceOwnerPasswordGrant` rejects every login with "Email not confirmed".
Disabling confirmations project-wide to fix this would weaken the real Owner claim flow, which is
the one flow where the address *is* a real inbox. That trade is not worth making.

**Rate limits.** [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits): the built-in
email provider sends **2 emails per hour**, and signup confirmation "defaults to 60 seconds window
before a new request is allowed to the same user". A school onboarding a class of 40 students —
never mind a roll of 500 — stalls immediately. Bulk student provisioning is a hard requirement for
this product; `signUp()` cannot meet it without custom SMTP, which is another paid dependency.

**Session clobbering.** A third, smaller problem: `signUp()` returns a session for the *new* user.
Called from the browser with the shared client it would sign the Owner out of their own account.
Solvable with a throwaway server-side client, but it is one more reason the flow does not fit.

**Conclusion for Q3: creation needs the same privileged treatment as reset.** Whichever mechanism
is chosen, it must both create the row and stamp `email_confirmed_at`.

**Also note a prerequisite gap.** Neither piece exists yet:

- `public.app_role` is `('school_owner', 'staff_user', 'dealer', 'super_admin', 'gov_official')`
  (`0001_foundation.sql`) — there is **no `student` role**.
- `public.students` (`0011_students_behaviour.sql`) has **no `profile_id` column**; there is
  currently no link at all from a student record to an auth user.

Both are additive migrations, but they are on the critical path for #434 and are larger design
decisions than this ticket covers (see §6).

---

## 4. Is there a supported alternative that avoids `auth.users` entirely?

Four candidates were checked. Three are dead ends; one is real.

**GoTrue's own endpoints — no.** The only endpoint that sets another user's password is
`PUT /admin/users/{id}`, i.e. `auth.admin.updateUserById`. The
[JS reference](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid) is explicit:
it requires the `service_role` key, and "This function should only be called on a server. Never
expose your `service_role` key in the browser." `PUT /user` (`auth.updateUser`) changes only the
*caller's* own password and needs the caller's session — useful for a student changing their own
password later, useless for an Owner setting it.

**Minting a session in SQL — no.** Signing a GoTrue-compatible JWT from a Postgres function would
need the project's JWT secret. On the live instance both
`current_setting('app.settings.jwt_secret', true)` and `current_setting('pgrst.jwt_secret', true)`
return not-set. The secret is not reachable from SQL. Closed.

**Supabase's newer admin APIs — no change.** The
[API keys guide](https://supabase.com/docs/guides/api/api-keys) introduces `sb_publishable_…` and
`sb_secret_…` keys. A secret key still "uses the `service_role` Postgres role" which "has full
access to your project's data" and "uses the `BYPASSRLS` attribute". Same privilege, better
lifecycle. Worth knowing separately: the legacy `anon` and `service_role` keys "will be deprecated
by the end of 2026", so this project's anon key is on a migration clock regardless of what #437
decides.

**Supabase Edge Function — yes, and better than expected.** From
[Edge Function secrets](https://supabase.com/docs/guides/functions/secrets), these are injected
into every function's environment automatically:

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
> `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_JWKS`

**The key is never stored anywhere you control.** It is not committed, not pasted into a Vercel
env var, not in `.env`, not in CI. It is read at runtime with
`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` inside a Deno isolate that never serves a byte to the
browser. This is materially stronger than the "hold a service key in a Vercel server-only env var"
option, because there is no copy of the secret to leak.

Free-tier viability (from [Pricing](https://supabase.com/pricing) and
[Edge Function limits](https://supabase.com/docs/guides/functions/limits)):

| | Free plan | Needed here |
|---|---|---|
| Edge Function invocations | 500,000 / month | a few thousand |
| Auth MAU | 50,000 | student roll |
| Memory / CPU / wall clock | 256 MB / 2 s CPU / 150 s | trivial |

No paid dependency is introduced. The relevant free-tier caveats are project-level and already
apply: free projects pause after one week of inactivity, and there is a limit of 2 active projects.

Authorisation is clean, too. [Edge Function auth](https://supabase.com/docs/guides/functions/auth)
confirms `verify_jwt = true` is the default, so the platform rejects unauthenticated calls before
your code runs. Inside, create *two* clients: one from the caller's `Authorization` header (RLS
applies, so it can only see the caller's own school) to verify the caller really is the
`school_owner` of the target student, and only then the admin client to set the password. The
existing `student_in_my_school(sid)` helper in `0011_students_behaviour.sql` is exactly the check
to reuse.

The costs are honest ones: a second deploy surface (`supabase functions deploy` and a
`SUPABASE_ACCESS_TOKEN` in CI), a second language runtime, one more thing that can be out of sync
with the migrations, and a service-role key existing inside the system's trust boundary at all.

---

## 5. If it needs a service-role key, what is the cheapest safe way to hold one?

Ranked, safest first:

1. **Edge Function with the platform-injected key.** No stored secret. Blast radius is one HTTP
   endpoint whose JWT is verified by the platform. Free.
2. **Vercel server-only env var + Next.js Server Action.** Works, free, no new runtime — the repo
   already uses server actions (`web/app/super-admin/schools/actions.ts`). But now there *is* a
   copy of the key: in Vercel's env store, in every developer's `.env.local`, in preview
   deployments, and in the shell history of whoever set it. A single `NEXT_PUBLIC_` typo ships it
   to the browser. Strictly worse than (1) for the same functionality.
3. **A `sb_secret_…` key rather than legacy `service_role`.** Orthogonal but worth doing whenever
   a key is introduced: per the API keys guide, secret keys can be rotated individually — "create
   a new secret API key, then replace it with the compromised key … delete the compromised one" —
   whereas rotating the legacy `service_role` JWT means rotating the project's JWT secret and
   invalidating every session.

**Does this break the no-service-role-key stance?** No — it refines it, and the stance was never
quite what it says on the tin. The point of #24 was *never let a key that bypasses RLS reach the
client, and make every privileged operation self-gate*. A `SECURITY DEFINER` RPC is already a
privilege-escalation primitive; it is safe because the gate is the first line of the function. An
Edge Function is the same bargain in a different runtime: a privileged executor, reachable only
through a gate you write.

The honest restatement is: **"no ambient super-privilege in anything the client can reach — every
privileged operation happens behind a gate that checks the caller."** Both the RPC and the Edge
Function satisfy that. The legacy-key deprecation at end of 2026 means this wording will need
revisiting anyway.

---

## 6. Recommendation

**Extend the existing RPC pattern, with the three defects fixed.**

Rationale: the pattern is already load-bearing in production (`create_staff_user`,
`create_vendor_user`), already tested, and needs no new runtime, no new deploy step, no new CI
secret, and no service-role key. Adding a third instance is a smaller change *and a smaller
security surface* than introducing an Edge Function — which would leave the two existing RPCs in
place anyway, giving the project both mechanisms instead of one.

Shape:

- `public.create_student_login(student_id uuid, login_email text, pw text) returns uuid` —
  gated on `app_current_role() = 'school_owner'` **and** `student_in_my_school(student_id)`.
  Insert `auth.users` + `auth.identities` copying `create_staff_user` **exactly** (all eight token
  columns as `''`, `instance_id` all-zero, `aud`/`role` `'authenticated'`, `email_confirmed_at =
  now()`, never `confirmed_at`), then `profiles`, then `students.profile_id`.
- `public.set_student_password(student_id uuid, pw text) returns void` — same gate; `UPDATE`
  only. This is the low-risk half: on a row GoTrue understands, an `UPDATE` of
  `encrypted_password` touches none of the fragile columns. It must additionally clear the token
  columns, `auth.one_time_tokens`, `auth.sessions` and `auth.refresh_tokens` for that user, to
  match `UpdatePassword`.
- **`gen_salt('bf', 10)`** in both. Retrofit `create_staff_user`, `create_vendor_user` and the
  seed migrations in the same PR.
- Mirror the configured password policy in both.
- Integration tests: student logs in with the set password; old session is dead after a reset;
  a *different* school's owner gets `not allowed`; the login shows up in the Dashboard with an
  `email` identity.

Keep the Edge Function as the documented fallback. The existing `ponytail` comment already names
the trigger — "swap to a service-role admin call if GoTrue's internal schema changes ever break
this" — and §4 now records that the swap is free and requires no stored secret, so the escape
hatch is real rather than aspirational.

**Where this is not certain.** Two things are genuinely unresolved. First, GoTrue's write grants to
`postgres` are platform legacy, not an upstream promise (§1), and no Supabase document commits to
keeping them; the approach could be revoked out from under the project with no deprecation window.
Second, the November 2023 `identities.id` rename shows that when this breaks it can break
*silently* (§2), and no amount of care in the RPC prevents that class of failure — only tests that
actually sign in do. Both risks are borne today by `create_staff_user`, so a third RPC adds no new
*kind* of exposure. But "we already do it" is a reason it is consistent, not a reason it is safe.

---

## 7. Sources

**Supabase docs**
- [Auth architecture](https://supabase.com/docs/guides/auth/architecture)
- [User Management (managing user data)](https://supabase.com/docs/guides/auth/managing-user-data)
- [Auth error: '500: Database error querying schema'](https://supabase.com/docs/guides/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44)
- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [User sessions](https://supabase.com/docs/guides/auth/sessions)
- [API keys (publishable / secret / legacy)](https://supabase.com/docs/guides/api/api-keys)
- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Edge Function auth](https://supabase.com/docs/guides/functions/auth)
- [Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Pricing](https://supabase.com/pricing)
- [`auth.admin.updateUserById` reference](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)

**GoTrue source** (`github.com/supabase/auth`, `master`, read 2026-08-23)
- `internal/models/user.go` — `User` struct, `Authenticate`, `IsConfirmed`, `IsBanned`, `UpdatePassword`, `FindUserByEmailAndAudience`
- `internal/api/token.go` — `ResourceOwnerPasswordGrant`
- `internal/api/admin.go` — `adminUserUpdate`
- `internal/crypto/password.go` — `CompareHashAndPassword`, `GenerateFromPassword`
- `migrations/20210722035447_adds_confirmed_at.up.sql`
- `migrations/20231117164230_add_id_pkey_identities.up.sql`
- `migrations/20240214120130_add_is_anonymous_column.up.sql`
- `migrations/20240612123726_enable_rls_update_grants.up.sql`

**Live `auth` schema** (Supabase Postgres 17.4, auth schema at `20260625000000`; read-only queries
against `information_schema.columns`, `information_schema.role_table_grants`, `pg_indexes`,
`pg_class`, `pg_roles`, `pg_policy`, and `gen_salt`) — see the caveat at the top of this document.

**This repo**
- `web/supabase/migrations/0001_foundation.sql` — `app_role` enum, `profiles`
- `web/supabase/migrations/0002_staff_permissions.sql` — `create_staff_user`
- `web/supabase/migrations/0006_territory_assignments.sql` — `create_vendor_user`
- `web/supabase/migrations/0011_students_behaviour.sql` — `students`, `student_in_my_school`
- `web/supabase/migrations/0054_demo_school_seed.sql` — seeded `auth.users` / `auth.identities`
- `web/supabase/migrations/0064_school_trial_and_owner_reset.sql` — `school_owner_email`
- `web/app/claim/page.tsx` — `signUp()` + `confirm-email` phase
- `web/app/super-admin/schools/actions.ts` — `sendOwnerReset` via `resetPasswordForEmail`
- `web/tests/integration/staff-permissions.test.ts` — asserts a SQL-created user can log in
