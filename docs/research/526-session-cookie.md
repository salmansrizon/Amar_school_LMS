# 526 — Can Supabase session material leave `document.cookie`?

Research for [#526](https://github.com/salmansrizon/Amar_school_LMS/issues/526), on map [#524](https://github.com/salmansrizon/Amar_school_LMS/issues/524).
Branch: `research/session-cookie`. Sources are `@supabase/ssr@0.12.0` source as vendored in `web/node_modules`, Supabase's own docs and maintainer replies, OWASP, and RFC 6265bis.

---

## TL;DR

**No — not while `createBrowserClient` exists in the app, and not by configuration at any version.** HttpOnly is not a flag `@supabase/ssr` can be talked into; it is incompatible with the library's design, and Supabase says so in writing. Getting the session out of `document.cookie` means deleting the browser client and moving its ~20 calls to the server.

The good news the UAT report could not have known: **this app's browser-client surface is already tiny and there is zero Realtime.** The migration is a day of work across 15 files, not a re-architecture.

Two cheaper findings surfaced on the way that are worth more than the HttpOnly debate: the auth cookie **is not marked `Secure`**, and the proxy **drops the library's anti-CDN-cache headers**. Both are one-line fixes. Do those first.

---

## 0. Correction to the ticket's premise

The ticket says `edume-auth` "does not exist in the repo." It does — on `origin/staging`, which is the branch deployed to `staging.edumebd.com`, which is what the UAT was run against.

| Ref | `web/lib/auth/cookie-options.ts` | Cookie name |
| --- | --- | --- |
| `origin/staging` | present (blob `cda77dd`) | `edume-auth` |
| `origin/main` | absent | `sb-<ref>-auth-token` |
| `HEAD` (`refactor/response-view-seam`) | absent | `sb-<ref>-auth-token` |

Added in commit `fbcbcf2` ("fix(#434): apply both review axes"), which is an ancestor of `origin/staging` but **not** of `origin/main` or of `HEAD` — `HEAD`'s merge-base with staging is `9721fc3`, which predates it. Nothing was reverted; the rename simply has not been promoted to main yet.

So the UAT report was **accurate about the name and accurate about the substance**. The ticket's diagnosis — "the name is wrong" — is itself the wrong correction. Both statements are true depending on the ref you look at, which is the actual hazard here: main and staging currently disagree about the session cookie's name, and promoting staging will sign every live user out once (which the file's own comment says is deliberate).

`web/lib/auth/cookie-options.ts` on staging sets `{ name, domain }` only. It sets no `httpOnly`, and no `secure`. The earlier attempt (`tests/unit/cookie-options.test.ts`) established the **domain** model, not the HttpOnly question — it never touched it.

---

## 1. Does `@supabase/ssr` support an HttpOnly server-managed session?

**No, at any version, and this is intentional rather than unimplemented.**

### Source evidence

`@supabase/ssr@0.12.0`, `src/utils/constants.ts` — the shipped default:

```ts
export const DEFAULT_COOKIE_OPTIONS: CookieOptions = {
  path: "/",
  sameSite: "lax",
  httpOnly: false,
  maxAge: 400 * 24 * 60 * 60,
};
```

This is the only occurrence of the string `httpOnly` in the entire package. It has been there since **v0.0.10**, whose changelog entry reads literally *"Set cookie default to `httpOnly: false`"* — i.e. the library once emitted HttpOnly cookies, and shipped a change to stop.

`src/cookies.ts` shows why. When `createBrowserClient` is given no `cookies` accessors — which is exactly this app's `web/lib/supabase/client.ts` — it wires its auth storage straight to the DOM:

```ts
} else if (!isServerClient && isBrowser()) {
  // The environment is browser, so use the document.cookie API to implement getAll and setAll.
  getAll = () => documentCookieGetAll();
  setAll = documentCookieSetAll;
}
```

and `documentCookieGetAll` is `parse(document.cookie)`. An HttpOnly cookie is invisible to that call by definition.

The package's own `types.ts` says this outright, in the doc comment on `CookieMethodsBrowser`:

> "Tokens and PKCE code verifiers are still persisted in cookies regardless of the `encode` option, so cookie access (custom or fallback) is required for auth to work."

That sentence closes the most obvious escape hatch. v0.8.0 added `cookies.encode: "tokens-only"` with a `userStorage` option, which moves the *user object* out of the cookie and into `localStorage`. It is tempting to read that as a privacy win. It is the opposite: it keeps the tokens in the cookie and moves the rest to a store with strictly weaker protection. It does not help here.

### Supabase's own position

Supabase's troubleshooting page ["How do I make the cookies HttpOnly?"](https://supabase.com/docs/guides/troubleshooting/how-do-i-make-the-cookies-httponly-vwweFx) answers that it

> "is not necessary, as both the access token and refresh token are designed to be passed around to different components in your application... The browser-based side of your application needs access to the refresh token to properly maintain a browser session anyway."

Maintainer `@hf` on [discussion #12303](https://github.com/orgs/supabase/discussions/12303), 2024-05-20:

> "HTTP-Only cookies are not an option unless you're making a very traditional web app using frameworks like Rails, Laravel, Django"

The discussion — *"Make auth JWTs http-only cookies (by default)"* — remains open and unimplemented as of August 2026.

Read that maintainer reply carefully, because it is the actual answer to this ticket. It is not "no." It is **"only if you make it a traditional server-rendered app."** This app is a Next.js App Router codebase that already does the overwhelming majority of its work in Server Components. It is *much closer* to hf's "traditional web app" than to the SPA the objection is aimed at. The blocker is not the architecture; it is the 15 files that still hold a browser client.

### The structural reason, from the cookie spec

Even granting perfect configuration, one thing can never work: **the browser can never write an HttpOnly cookie.** RFC 6265bis §5.7 (Storage Model):

> "If the cookie was received from a 'non-HTTP' API and the cookie's http-only-flag is true, abort this algorithm and ignore the cookie entirely."

and, on overwriting:

> "If the newly-created cookie was received from a 'non-HTTP' API and the old-cookie's http-only-flag is true, abort this algorithm and ignore the newly created cookie entirely."

This app signs users in from the browser — `components/login-form.tsx` calls `supabase.auth.signInWithPassword`. That is where the session cookie is first written, from page JavaScript, so it is *born* non-HttpOnly and there is no configuration that changes it. Worse, the second clause means a half-migration is a trap: if the server ever sets an HttpOnly `edume-auth` and the browser client later tries to refresh it, the browser's write is **silently discarded** and the session goes stale with no error anywhere.

Setting `cookieOptions: { httpOnly: true }` on `createServerClient` alone (the "workaround" floating around in that discussion) produces exactly that half-migration. The option does flow through — `setCookieOptions = { ...DEFAULT_COOKIE_OPTIONS, ...options?.cookieOptions }` in `cookies.ts`, and `web/proxy.ts`'s `setAll` forwards `options` intact to `response.cookies.set`. **It will appear to work and then break sign-in.** Do not ship it as a standalone fix.

**Conclusion:** HttpOnly is all-or-nothing. It requires removing every `createBrowserClient` from authenticated paths. There is no version to upgrade to.

---

## 2. What breaks if the browser cannot read the token

Every `createClient()` call site under `web/app` and `web/components` — 15 files, all of `web/lib/supabase/client.ts`'s importers:

| File | What it does with the session |
| --- | --- |
| `web/components/login-form.tsx` | `auth.signInWithPassword`, `auth.signOut`, `from('profiles')` |
| `web/components/logout-button.tsx` | `auth.signOut` |
| `web/components/notification-inbox.tsx` | `rpc('notification_mark_read')` ×2 |
| `web/components/notifications-bell.tsx` | `rpc('notification_mark_read')` |
| `web/app/claim/page.tsx` | `auth.getUser`, `auth.signUp`, `from('profiles')`, `rpc('redeem_school_claim_code')` |
| `web/app/reset-password/page.tsx` | `auth.resetPasswordForEmail` (anonymous — unaffected) |
| `web/app/reset-password/update/page.tsx` | `auth.updateUser` |
| `web/app/school/institute/profile-form.tsx` | `storage.from('school-logos')` upload + remove |
| `web/app/school/notices/new/create-form.tsx` | `storage.from('publications')` upload + remove |
| `web/app/school/notices/gallery/[albumId]/photo-controls.tsx` | `storage.from('gallery')` upload + remove |
| `web/app/school/classes/syllabus/syllabus-controls.tsx` | `storage` upload |
| `web/app/school/fees/attachment-picker.tsx` | `storage` upload |
| `web/app/school/students/new/admission-form.tsx` | `storage` upload |
| `web/app/student/tasks/[id]/submit-work.tsx` | `storage.from('submissions')` upload + remove |
| `web/app/student/profile/correction-form.tsx` | `storage.from('student-photos')` upload |

Plus `web/lib/auth/post-login.ts` (`auth.getUser` + `from('profiles')`), which is handed the browser client by `login-form`.

That is roughly **20 authenticated operations in three shapes**: auth verbs, storage uploads, and three RPCs. Every one fails identically under HttpOnly — the client falls back to the anon key with no user JWT, and RLS refuses it. Uploads would fail with a storage RLS denial; the RPCs would return empty; sign-in would appear to succeed and then the session would vanish.

Compare against the same grep run over all of `web/app` + `web/components` including Server Components: **316 `.from` and 58 `.rpc` calls**. The browser client accounts for **one** `.from` and **three** `.rpc`. The data layer is already server-side. That ratio is the whole argument for feasibility.

### Realtime

**There is none.** Zero matches across `web/app`, `web/components`, `web/lib` for `.channel(`, `realtime`, or `onAuthStateChange`. `notifications-bell.tsx` and `notification-inbox.tsx` poll from Server Components and use the browser client only to mark-as-read.

This matters more than anything else in this document. Realtime is the one Supabase feature that genuinely requires a client-side token — the WebSocket authenticates with the access token and needs `setAuth` on refresh. It is the standard reason HttpOnly migrations get abandoned. **This app does not use it,** so the standard blocker does not apply. If Realtime is ever adopted, this window closes.

---

## 3. Is a route-handler / server proxy the supported answer, and what does it cost?

Yes — it is what hf's "traditional web app" means, and it is what the App Router is for. But note the shape: the answer is **not** a generic `/api/supabase/*` passthrough proxy. That would be a new, hand-written auth boundary — the thing most likely to grow an IDOR. The answer is ordinary **Server Actions and route handlers**, each doing one named operation, using the `createServerClient` that `web/lib/supabase/server.ts` already provides.

Cost per request, from Supabase's [Next.js server-side guide](https://supabase.com/docs/guides/auth/server-side/nextjs):

- `getUser()` "makes a network call to the project's Auth instance... at the cost of a network call." `web/proxy.ts` already pays this on **every matched route** — the matcher is site-wide minus static assets — so the migration adds nothing to the steady state. This is already the dominant per-request cost and it is already being paid.
- `getSession()` is free but unverified: *"Never trust `supabase.auth.getSession()` inside server code such as Proxy. It isn't guaranteed to revalidate the Auth token."*
- `getClaims()` "reads the access token from storage and verifies it. Locally via the WebCrypto API and a cached JWKS endpoint when the project uses asymmetric signing keys." **This is the real optimisation available here** — swapping the proxy's `getUser()` for `getClaims()` on an asymmetric-signing-key project removes a network round-trip from every page load. Worth its own ticket regardless of whether HttpOnly happens; it likely pays for the whole migration's latency budget and then some.

For the storage uploads specifically, the app already has the pattern: `web/app/api/student-photo/route.ts`, `student/submission`, `gallery-photo`, `syllabus`, `school-logo`, `publication-image`, `accounting-attachment` are all server-side storage routes, and `fbcbcf2`'s own commit message notes a shared "member-or-student guard" was moved "into `lib/storage`, where the next route will find it." The seven browser uploads are the stragglers, not a new design.

Added cost per upload: one extra hop, and file bytes transit the Next.js server instead of going straight to Supabase Storage. On Vercel that means request-body limits and function duration apply. If any bucket takes large files, use a **server-issued signed upload URL** (`createSignedUploadUrl`) so the browser still PUTs directly to storage — the token stays server-side and the bytes do not.

---

## 4. Rotation on privilege change, and invalidation on logout/revocation

From [Supabase's sessions guide](https://supabase.com/docs/guides/auth/sessions):

- **Rotation:** "a refresh token can only be used once" — each refresh issues a new pair.
- **Reuse detection:** a refresh token may be reused within a 10-second interval by default; outside it, "the whole session is regarded as terminated and all refresh tokens belonging to it are marked as revoked."
- **Logout:** "the sessions affected by the logout are removed from the database entirely," verifiable via the JWT's `session_id` claim against `auth.sessions`.
- **Access token lifetime:** default 1 hour; below 5 minutes is discouraged.

OWASP's [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) requires that the session ID "be renewed or regenerated by the web application after any privilege level change within the associated user session," and that on expiry the app "must take active actions to invalidate the session on both sides, client and server."

**This is where the app has a real, HttpOnly-independent gap.** Privilege in this app is not carried in the JWT — it is `profiles.role` and `staff_permissions.screen_key`, read fresh by `web/proxy.ts` on every protected request. That is *better* than a stale JWT claim for authorization, and it means a permission revocation takes effect on the next navigation without any token rotation. Good.

But the corollary is that Supabase never learns a privilege change happened, so **nothing rotates the session on one**. An access token minted before a demotion stays valid for up to an hour. It cannot open a screen — the proxy re-reads the grant — but it is still a live credential for direct PostgREST calls, where only RLS stands between it and the data. Whether that is a finding depends on whether the RLS policies are as tight as the proxy; that is issue #527's question, not this one, but the two meet here.

`supabase.auth.signOut()` from `logout-button.tsx` does the right thing today: it revokes server-side and clears the cookie. Under HttpOnly it must become a server action, or logout stops clearing the cookie — the browser cannot delete a cookie it cannot see. **That is the single most breakable step of the migration**: a logout that revokes the session but leaves the cookie in place looks fine in manual testing and is a live bug.

---

## 5. Is base64 encoding relevant to the risk?

**No, and the report was right to say so.** `cookies.ts` prefixes the value with `base64-` and calls `stringToBase64URL`; the sole purpose is transport-safety for chunked cookie values, which the same file's comments make explicit. It is not claimed as a protection by anyone.

Restating it as a finding is noise, and slightly harmful noise — it implies that a different encoding would help. It would not. The risk is entirely that a JS-readable cookie is exfiltrable by any XSS on the origin; what is inside it is irrelevant. OWASP's related point is the opposite of a defence of encoding: session ID content "must be meaningless to prevent information disclosure attacks," with meaning held server-side.

Note also OWASP's caveat that HttpOnly is not a complete XSS answer either: "if an XSS attack is combined with a CSRF attack, the requests sent to the web application will include the session cookie, as the browser always includes the cookies when sending requests." HttpOnly stops **token theft** (attacker replays the session from their own machine, indefinitely, off-network). It does not stop an attacker acting as the user inside the victim's browser. That is a large reduction in blast radius, not an elimination — and it is why this should be sized as hardening, not as a breach fix.

---

## 6. Two adjacent findings, both one-liners, both worth more per hour than §1

**a. The auth cookie is not `Secure`.** `grep -rn "secure" src/` across `@supabase/ssr@0.12.0` returns **nothing**. `DEFAULT_COOKIE_OPTIONS` omits it, and `cookie`'s `serialize` defaults it to false. The staging `authCookieOptions()` returns only `{ name, domain }`. So the session cookie carries no `Secure` attribute and is eligible to be sent over plaintext HTTP. HSTS on `edumebd.com` mitigates it in practice, but a `Secure` flag is free and does not depend on HSTS being preloaded. Add `secure: process.env.NODE_ENV === 'production'` to `authCookieOptions`.

This is strictly better value than the HttpOnly work: one line, no blast radius, closes a real transport exposure.

**b. `web/proxy.ts` discards the library's cache-control headers.** Since v0.10.0, `@supabase/ssr` passes a second argument to `setAll`:

```ts
{
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
}
```

`types.ts` explains why: *"Responses that set auth cookies must not be cached by CDNs or reverse proxies, otherwise one user's session token can be served to a different user."* The app's `setAll` takes only `(toSet)` and never applies them. On Vercel's edge network, a cached `Set-Cookie` from a token refresh is a session handed to a stranger — a **worse** outcome than the XSS-readable cookie this ticket is about, because it needs no attacker at all.

Fix (`web/proxy.ts`):

```ts
setAll: (toSet, headers) => {
  toSet.forEach(({ name, value }) => request.cookies.set(name, value))
  response = NextResponse.next({ request })
  toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v))
},
```

Also note `web/package.json` pins `"@supabase/ssr": "^0.12.0"` while 0.12.5 is current; 0.12.1–0.12.5 include server-side PKCE verifier flushing, cookie deduplication, and domain-scoped deletion fixes — all directly relevant to the cross-subdomain cookie model staging just adopted.

---

## RECOMMENDATION

### Do now, this week — not tickets, a single small PR

1. **Add `secure: true` in production** to `authCookieOptions` on staging (§6a). One line.
2. **Forward the cache headers in `web/proxy.ts`** (§6b). Four lines. Prevents CDN-cached sessions.
3. **Bump `@supabase/ssr` to 0.12.5.** Changelog is directly relevant to the domain-cookie model.
4. **Decide the `edume-auth` promotion.** Main and staging disagree today. Promoting signs everyone out once, by design — fine, but it should be a decision with a note in the release, not a surprise.

These are ~6 lines total and close two real exposures. Ship them before anything in §1 is scheduled.

### Then decide on HttpOnly, with eyes open

**Recommend: yes, do it — but as scheduled hardening, not as a P0, and only as one atomic migration.**

The case for: the browser surface is ~20 calls in 15 files, there is no Realtime, the data layer is already server-side, and server-side storage routes already exist to copy. This app is unusually well-positioned; most Supabase codebases cannot do this at all. The case against urgency: HttpOnly mitigates token *theft*, not in-browser action (§5), and there is no evidence of an XSS vector today — issue #527 is the one that would find it.

**Migration path**, in dependency order. Steps 1–3 are independently shippable and each reduces the browser surface on their own merits; step 4 is the irreversible one.

1. **Storage uploads → server (7 files).** Follow the existing `/api/*` routes and the `lib/storage` guard from `fbcbcf2`. For large buckets, issue a signed upload URL server-side so bytes still go direct. Independently valuable: it stops trusting the client with bucket paths.
2. **The three RPCs → Server Actions.** `notification_mark_read` ×2 and `redeem_school_claim_code`. Small.
3. **Auth verbs → Server Actions.** `signInWithPassword`, `signOut`, `signUp`, `updateUser`, `getUser`, and `post-login.ts`. `resetPasswordForEmail` is anonymous and can stay. **`signOut` is the one to get right** — under HttpOnly only the server can clear the cookie (§4).
4. **Flip `httpOnly: true` in `authCookieOptions` and delete `web/lib/supabase/client.ts`.** Both in the same commit. The delete is what makes it safe: with the file gone, a re-introduced browser client is a compile error rather than a silently-dead session.

**Do not** ship step 4 before 1–3, and do not ship `httpOnly` on the server client alone. RFC 6265bis §5.7 means the browser's subsequent refresh writes are *silently ignored* — sign-in appears to work and the session dies later, which is the worst possible failure mode to debug.

### Blast radius

- **15 files** import the browser client; **1 file** (`web/lib/supabase/client.ts`) is deleted at the end.
- **~20 authenticated calls** move server-side. Against 316 `.from` + 58 `.rpc` already on the server.
- **Zero Realtime** — the usual blocker is absent. This is the reason the migration is viable; it stops being viable the day Realtime is adopted.
- **Latency:** net-neutral-to-better. The proxy already pays `getUser()`'s network call site-wide; switching it to `getClaims()` (local JWKS verification) plausibly nets a *win*. Uploads gain one hop unless signed URLs are used.
- **Tests:** every Playwright flow that signs in via the login form, plus `web/e2e/live-check.mjs`. The seven upload flows need re-verification against real RLS.
- **Not fixed by this:** in-browser XSS acting as the user (§5), and the absence of session rotation on privilege change (§4). Both belong to #527.

### On the UAT report

Restore its credibility. `edume-auth` was correct for the deploy under test; the ticket's correction was itself wrong (§0). Its base64 point was the only weak claim, and it disclaimed that itself. Its severity call — P0 — is the part to revise down: this is hardening against a vector nobody has demonstrated, whereas the CDN-caching bug in §6b needs no attacker and is four lines away.

---

## Sources

- `@supabase/ssr@0.12.0` — `src/utils/constants.ts`, `src/cookies.ts`, `src/types.ts`, `src/createBrowserClient.ts`, `src/createServerClient.ts` (vendored in `web/node_modules/@supabase/ssr`)
- [supabase/ssr CHANGELOG](https://github.com/supabase/ssr/blob/main/CHANGELOG.md)
- [Supabase — How do I make the cookies HttpOnly?](https://supabase.com/docs/guides/troubleshooting/how-do-i-make-the-cookies-httponly-vwweFx)
- [Supabase discussion #12303 — Make auth JWTs http-only cookies (by default)](https://github.com/orgs/supabase/discussions/12303)
- [Supabase — User sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase — Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase — Advanced guide (SSR)](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [RFC 6265bis §5.7, §5.8.2, §5.8.3](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html)
- Repo: `web/lib/supabase/client.ts`, `web/lib/supabase/server.ts`, `web/proxy.ts`, `web/lib/auth/post-login.ts`, `origin/staging:web/lib/auth/cookie-options.ts`, commit `fbcbcf2`
