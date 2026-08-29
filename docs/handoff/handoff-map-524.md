# Handoff — map #524 (UAT release readiness), next session: documentation

Written at the end of a long execution session. Everything below is state a fresh
agent cannot reconstruct from the repo alone. Anything that *is* in the repo is
referenced, not repeated.

## Session 2 (2026-08-28, later): what this handoff asked for is done

Everything in "Documentation work outstanding" below is closed, and the four
remaining code tickets went with it. Kept as written because the reasoning still
applies; read this block first, then the original for the why.

- **§1 research docs** — cherry-picked onto this branch (`11e9151`, `02387e8`). Both now live at `docs/research/`. `research/session-cookie` and `research/security-headers` still exist and still carry `2a2f934`, a real student-portal refactor + 10 tests that is on NO other branch. Not merged here — it is behaviour-preserving work nobody asked for in this map, and it is the user's call. **Do not delete those branches until that commit has a home.**
- **§2 UAT report** — tracked, byte-identical, with a corrections annex and a banner pointing at it (`11824e2`). `docs/testing/uat-plan.md` came too; `uat-checklist.md` had been linking to an untracked file.
- **§3 ADR** — `docs/adr/0022-gapless-numbering-serialises-its-issuers.md` (`aed6f3b`). 0012 gained an amendment banner. The session-cookie ADR stayed unwritten, as decided.
- **§4 CONTEXT.md** — one sentence, not none (`1d5aa87`). The Permission Grant entry still said the two axes were "independent", which is the exact reading ADR 0021 overturned. Nothing added.
- **#531, #538, #540, #528** — closed. Reasoning is on each issue.
- **#544** remains open by design: it needs a deployed staging to walk.

Two things found on the way, neither reported by UAT:

- **An Owner could not delete an open exam** whose children existed — the cascade guard read the already-deleted parent as "closed". Fixed in `0171`, pinned in `exam-delete-guard.test.ts`.
- **A subject cannot be deleted once a student has asked about it**, by anyone but a Super Admin, and it fails with a constraint error naming a table the Owner has never seen. Filed as **#548** with the four candidate fixes; it needs a decision, not a patch.

Migrations `0170` and `0171` are applied to the shared project.

## Where things are

- **Branch:** `feat/525-class-attachment-narrows-grant`, 36 commits ahead of `origin/staging`. Nothing pushed. No PR yet — `web/AGENTS.md` says the PR is opened once the map completes, not per ticket.
- **Map:** https://github.com/salmansrizon/Amar_school_LMS/issues/524 — read its body first. It carries the destination, the tier rationale, the inherited gates, and an "audit corrections" section.
- **Closed this session:** #525 #526 #527 #529 #530 #532 #533 #534 #535 #536 #537 #539 #541 #542 #543 #545 #546 #547
- **Still open:** #528, #531, #538, #540, and exit gate #544.
- **Filed this session:** #546 (unbounded aggregates), #547 (invoice numbering).
- **Migrations 0160–0169 are APPLIED to the shared database** (staging + main share one Supabase project, ref `bwsnjtnxiypehbipdttp`). The app code is not deployed, so staging currently runs old code against a newer schema. That is expected; it resolves when this branch merges.

Per-ticket reasoning is on each GitHub issue as a closing comment, and the *why*
of each change is in its commit message. Both are deliberately long. Read those
before re-deriving anything.

## The one thing to carry forward above all else

**The UAT report is reliable about symptoms it observed and unreliable about causes it inferred.** Verified wrong, each at the source:

| Report claim | Reality |
|---|---|
| "Ledger out of balance by ৳2,800" (release blocker) | Ledger balances exactly. Page summed 1,000 of 46,521 rows; that prefix differs by exactly 280,000 paisa |
| "Fee collection form never appears" (P1) | Form works. One navigation dropped the `class` param |
| "Class Teacher P0 leak — 82 students" | No leak. 82 = her own school's exact count. Model gap, not tenant breach |
| "`/super-admin/locations` renders nothing" | Renders fine; contradicted by the report's own Pass 2 |
| "Repeated `InvoiceGenerated`, 0 items" | 1,276 events for 1,276 invoices, one each. The "0" is the Tries column |
| "39 duplicate class combos" | Orphaned `class_name` TEXT, not duplication |
| "`edume-auth` cookie readable" | **Report was RIGHT.** My first correction was wrong — it exists on `origin/staging` only |

Trust the observation. Re-derive the cause.

## Documentation work outstanding

### 1. Both research docs live only on an unmerged branch — highest priority

`docs/research/526-session-cookie.md` and `docs/research/543-security-headers.md`
are both on **`research/security-headers`** (commits `0e111f8`, `52568d6`).

The branch named `research/session-cookie` does **not** contain the session doc —
the second research agent branched from the first's work, so both landed on one
branch. That naming is actively misleading; fix or delete the stale branch.

These two docs are load-bearing: #528's entire implementation follows 543, and
#527's approach follows 526. Neither is reachable from the working branch. Decide
whether they merge into this branch, into `staging`, or stay as research
artifacts — but not "unreferenced on a branch nobody remembers".

### 2. The UAT report is untracked

`docs/testing/staging-owner-superadmin-uat-report.md` is **untracked** (`git status` shows `??`), yet map #524 and every ticket cite it as the source. An untracked source of truth is a hazard.

Options: track it as-is and add a corrections annex; or track it with inline
corrections. **Do not silently edit the findings** — the record of what a UAT pass
believed is itself worth keeping, and the map's "audit corrections" section already
depends on the original text being intact.

The table above is the raw material for that annex.

### 3. ADR candidate — one, and only one

`0168`/`0169` established that **a Postgres sequence cannot implement gapless numbering** — `nextval` is non-transactional by design, so a rolled-back issue burns its number permanently. ADR 0012 required gapless numbering and the code used a sequence; the two contradicted each other from the day both were written.

That clears the three-of-three bar: hard to reverse (the counter serialises concurrent issuers, which is a real throughput trade), surprising without context ("why not a sequence?"), and a genuine trade-off (gapless and lock-free are mutually exclusive).

**Already decided NOT to write:** an ADR for the session cookie rename or the HttpOnly migration. `web/lib/auth/cookie-options.ts` carries a 17-line comment, and #526/#527/#545 carry the rest. A fourth copy is the one that goes stale. Do not revisit without new information.

### 4. `CONTEXT.md` needs little or nothing

It already defines class attachment, Permission Grant, Class Teacher, Subject Teacher. **Do not add** "signed upload", "trial balance" or "invoice number" — that skill's own rule is that `CONTEXT.md` is a glossary of *domain* language, devoid of implementation. A school owner does not say "signed upload".

### 5. ADRs touched, for reference not rework

- `docs/adr/0021-a-class-attachment-narrows-a-grant.md` — new. The fourth decision about one question, written to be the last.
- `docs/adr/0018-...md` — gained a "superseded in part by 0021" banner.

## Traps this session hit more than once

- **Cleanups that silently do nothing.** Hit twice: an Owner `delete()` on `student_profile_change_requests` (Owner has UPDATE only), and a delete on `invoice_number_counters` (RLS on, no policies). Both reported no error. If a teardown matters, assert it worked.
- **Tests that pass vacuously.** "This actor sees nothing" also passes when the actor is not signed in. `negative-access.test.ts` now asserts every session is real first. The i18n audit asserts it parsed >1,500 entries before concluding zero failures.
- **Typecheck does not enforce the server/client boundary.** `next build` does. A client component importing a module that reaches `next/headers` typechecks clean and fails the build.
- **Editing source while a suite runs** produces phantom failures. Cost one wrong "I broke something" report. Re-run before concluding.
- **`| tail -N` on a long test run** truncates the failure list. Redirect to a file.

## Environment notes

- Migrations are applied manually via the Supabase MCP, not by CI.
- `seat-plan-v2.test.ts` fails 6/12 on unmodified `staging` — pre-existing, tracked as #520. Not caused by this branch.
- Playwright config is `workers: 1`, `fullyParallel: false`.
- Credentials for every role are in the user's private memory, not here.

## Suggested skills

- **`domain-modeling`** — for the ADR decision in §3 and to confirm §4's "add nothing". It owns the three-of-three ADR bar and the rule that `CONTEXT.md` holds no implementation.
- **`writing-for-agents`** — the UAT-report annex in §2 is a document future agents will read to decide what to trust; it should be written for that audience.
- **`research`** — only if the numbering ADR needs primary sources on gapless-vs-lock-free. The Postgres sequence behaviour is documented; do not re-research what §3 already states.
- **`code-review`** — *not* for docs. Skip unless code changes.

## If the next session drifts into code

The remaining tickets are #528 (blocked on a staging deploy to verify whether Next
*appends* or *replaces* `next.config.ts`'s CSP header — untestable locally), #531
(idempotency key, receipt preview), #538 (designed states, the largest), #540
(44px targets, mobile cards). #538 and #540 touch the same surfaces and should be
done together. #544 is the exit gate and shows 21 open blockers, 13 of them
inherited from map #458.
