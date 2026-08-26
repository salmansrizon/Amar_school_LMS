# Handoff — Student Portal (map #434)

**Date:** 2026-08-26 · **Branches:** `feat/student-portal-434`, `fix/staff-screen-grants-rls`
**Next session:** finish map #434 (three tickets left), then clear the merge fog.

> Written to `docs/handoff/` at the user's explicit request. The `/handoff` skill defaults to the OS temp dir; the user overrode that.

---

## Where things stand

Map **#434** (Student Portal) — **20 of 23 sub-issues closed**. Details are on the issues and in the commit messages; this document does not repeat them.

| Remaining | |
|---|---|
| [#455](https://github.com/salmansrizon/Amar_school_LMS/issues/455) | Owner response-performance dashboard |
| [#456](https://github.com/salmansrizon/Amar_school_LMS/issues/456) | Profile correction requests |
| [#457](https://github.com/salmansrizon/Amar_school_LMS/issues/457) | Student search |
| [#439](https://github.com/salmansrizon/Amar_school_LMS/issues/439) | Prototype — **skipped by user instruction**, still open. Close or leave. |

Two open PRs, **neither merged**:

- **[#505](https://github.com/salmansrizon/Amar_school_LMS/pull/505)** → `staging`, 17 commits. The portal itself.
- **[#506](https://github.com/salmansrizon/Amar_school_LMS/pull/506)** → `staging`, 1 commit. Fixes **GHSA-f3w3-vrhc-983v** (draft advisory, private).

Migrations **0130–0148** are already **applied to the shared Supabase project** `bwsnjtnxiypehbipdttp` (staging and main share it). The database is ahead of both deployed environments; that skew is deliberate and was assessed as benign.

## Standing instructions from the user

1. **Do not merge anything** without first running a `/grill-with-docs` session on the merge itself. Nothing may be lost or overwritten. This is the user's explicit constraint and is the reason both PRs are still open.
2. **Preserve the second developer's work.** `mahbub-java` has #503/#504 in flight (unmerged, no PR yet). Do not delete their data or touch their files.
3. Architecture review: **implement Strong recommendations only.**

## Conventions this map established

- **Migrations start at 0130.** 0120–0129 are reserved for #503/#504 so the branches never contend.
- **Reads go through `SECURITY DEFINER` views, not per-table student policies.** `student_self`, `student_routine`, `student_material`, `student_exam_result`, `student_seat_assignment`, `student_fee_record`, `student_message_inbox`, `student_subject_option`. A Student has no policy on `students`, `exam_marks`, `employees`, `subjects`, `rooms`, `class_syllabi` — sensitive columns are *absent from the surface*, not merely unselected.
- **`app_current_school_id()` excludes students.** Student-side policies use `app_current_student_id()`, `app_current_student_school_id()`, `student_in_class()`, `student_matches_target()`.
- Any definer predicate added to a policy must be wrapped `(select …)` or it re-evaluates per row — that pushed the billing sweep into a statement timeout once already.
- Pure logic lives in `web/lib/student/*.ts` with unit tests; I/O sits beside it in a `*-source.ts`.

## Decisions to read before continuing

- `CONTEXT.md` — **Student**, **Parent / Guardian**, **Student Number**, **Class Teacher**, **Period**, **Permission Grant**, **Fee Collection Record**.
- `docs/adr/0015-a-student-never-sees-their-own-fee-adjustment.md`
- `docs/adr/0016-per-instance-workflow-approver.md`
- Map #434's **"Not yet specified"** section — seven decisions from the fog-grilling session.
- Amendments on [#436](https://github.com/salmansrizon/Amar_school_LMS/issues/436) and [#438](https://github.com/salmansrizon/Amar_school_LMS/issues/438), which correct their own original decisions.

## Open threads the next session inherits

**ADR 0016 is written but not implemented, and the reason changed.** The grilling concluded student leave should route to the Class Teacher via a new per-instance workflow approver. Building #452 revealed that the shipped leave queue at `/school/attendance/leave` is a **plain `status` column with `requireSchoolMember` actions — not the workflow engine at all**. #452 says "reuse that workflow end to end, nothing new on the staff side", so it was built on the existing queue and ADR 0016 was *not* implemented. **#456 is now the first real consumer.** Flag this to the user before building #456 — the ADR's premise needs re-checking against how corrections should actually be approved.

**#445 has one bullet deliberately unimplemented.** "A class teacher may post to their own class **and only their own class**" — the second half is not enforced. The same policy lets the Owner and office staff post for any class, and restricting teachers needs a trigger that carves out every other legitimate author. Recorded on the issue; wants its own decision.

**Architecture review, [report in `$TMPDIR`](file:///var/folders/df/xvbb4c0j2zn25ysqm7jn_lw40000gn/T/architecture-review-20260826-075930.html)** (regenerate if gone). Candidate 1 shipped as PR #506. Still outstanding and rated **Strong**:
- **#2** the write path has no interface — 185 server actions, 4,387 LOC, no test imports any of them; `web/modules/` does not exist and 0 of 57 action files import an engine.
- **#3** Class is three modules — `class-catalogue.ts` (id), `students.ts` (text, `' / '`), `classes.ts` (`"name|section"`), with two live label formats.
- **#4** production crons run under `anon`'s 3s `statement_timeout`.

**`/improve-codebase-architecture` is overdue** — `web/AGENTS.md` wants it every 3 tickets and roughly 9 have shipped since the last one. It is user-invoke only; ask, do not attempt it.

## Test state

`npm run typecheck` clean · **791 unit** · integration green **except two pre-existing failures that are not this map's**:

| Suite | Cause |
|---|---|
| `seat-plan-v2` (6) | Another developer's `ST504 ScopeCheck` students sit in the fixture's reused classes, breaking its room-capacity arithmetic. Verified not RLS by removing the guard and re-running. **Do not delete their rows.** |
| `subscription-sweep` (1) | ~17.5k `t-%` fixture billing runs vs 271 real; the sweep now exceeds `anon`'s 3s timeout. |

Both share one root cause — **integration suites share one live database with two developers and clean up by name prefix**. The proposed fix (a per-run School, torn down by `0068`'s cascade) was put to the user and is undecided.

Two tickets the user asked about and **have not been filed**: `revoke_student_login`, and the subscription-sweep fixture pruning.

## Suggested skills

- **`/grill-with-docs`** — required before any merge. Also the right tool for the ADR 0016 question above.
- **`/implement`** — for #455, #456, #457. Follow `web/AGENTS.md`: implement → `/code-review` → close the sub-issue → next. Never close the map itself.
- **`/code-review`** — after each ticket. It has caught real security holes on this map twice.
- **`/improve-codebase-architecture`** — ask the user to run it; it refuses model invocation.
- **`/domain-modeling`** — when a decision crystallises, write it to `CONTEXT.md` or an ADR inline, not in a batch.

## Gotchas that cost time

- `exam_marks.obtained_marks` is a **generated** column — never insert it.
- `attendance_records` has **no INSERT policy** for school members; the reconcile job writes it as definer. Test fixtures cannot forge a row.
- `reconcile_attendance` filters on `schools.automatic_attendance_enabled`. A suite left it `false` on Test School A and made three unrelated suites fail.
- Print **themes** are an admit-card concept only; mark sheets pick a layout from `?template=1|2|3`.
- `publications.target_shift_id` is dead — the student-side Shift concept was deleted by `0060`. Never filter on it.
- Deriving which screen owns a table? **Follow `@/lib` imports transitively**, not just `app/school/**`. Scanning only `app/` mis-assigned four tables in PR #506.
