# Handoff — Student Portal (map #434)

**Date:** 2026-08-26 · **Branches:** `feat/student-portal-434` (21 commits), `fix/staff-screen-grants-rls` (1)
**State:** map complete. Next session: the merge.

> Written to `docs/handoff/` at the user's request; the `/handoff` skill defaults to the OS temp dir.

---

## Where things stand

Map **[#434](https://github.com/salmansrizon/Amar_school_LMS/issues/434)** — **22 of 23 sub-issues closed.** Only [#439](https://github.com/salmansrizon/Amar_school_LMS/issues/439) (prototype) is open; the user instructed it be skipped. **Do not close the map itself** (`web/AGENTS.md`).

Two open PRs, **neither merged**:

- **[#505](https://github.com/salmansrizon/Amar_school_LMS/pull/505)** → `staging`. The portal: 12 student screens, teacher and owner surfaces, migrations 0130–0149.
- **[#506](https://github.com/salmansrizon/Amar_school_LMS/pull/506)** → `staging`. Fixes **GHSA-f3w3-vrhc-983v** (draft advisory, private).

Migrations **0130–0149 are already applied** to the shared Supabase project `bwsnjtnxiypehbipdttp`. The database is ahead of both deployed environments; assessed as benign, since no pre-existing role's behaviour changed.

## The next session's job

**The merge, and only after a `/grill-with-docs` session on it.** This is the user's explicit standing instruction: nothing may be lost or overwritten without that conversation first. It is the sole reason both PRs are still open.

Fog to clear in that session, at minimum:

1. **Merge order.** #505 and #506 touch different migrations and different files and both report CLEAN, but #506 gates `employees` and #505's `/school/my-classes` depends on `app_current_employee_id()` (0138) because of it. They are correct in either order *on the database*, which already has both — but a staging deploy of one without the other is a state neither PR was tested in.
2. **#503/#504.** `mahbub-java` still has these in flight, unmerged, no PR. Migrations 0120–0129 are reserved for them; `class-controls.tsx` was deliberately de-conflicted. Their merge lands on top of ours.
3. **The two red suites** (below) — decide whether they block the merge.

## Standing instructions

1. **No merge without `/grill-with-docs`.**
2. **Preserve the second developer's work.** Do not delete their data or touch their files.
3. Architecture review: **Strong recommendations only.**

## Conventions this map established

- **Migrations start at 0130.** 0120–0129 reserved for #503/#504.
- **Student reads go through `SECURITY DEFINER` views, never per-table student policies.** `student_self`, `student_routine`, `student_material`, `student_exam_result`, `student_seat_assignment`, `student_fee_record`, `student_message_inbox`, `student_subject_option`, `student_login_info`, `employee_card`, `task_completion_roster`. A Student has **no policy** on `students`, `exam_marks`, `employees`, `subjects`, `rooms`, `class_syllabi`, `fee_collection_records` — sensitive columns are *absent from the surface*, not merely unselected.
- **`app_current_school_id()` excludes students.** Student policies use `app_current_student_id()`, `app_current_student_school_id()`, `student_in_class()`, `student_matches_target()`.
- Any definer predicate in a policy must be wrapped `(select …)` or it re-evaluates per row.
- Pure logic in `web/lib/student/*.ts` with unit tests; I/O beside it in `*-source.ts`.
- Writes check `isReadOnly(ctx)` — an Expired school is read-only for Students, not dark.

## Decisions to read before touching anything

- `CONTEXT.md` — **Student**, **Parent / Guardian**, **Student Number**, **Class Teacher**, **Period**, **Permission Grant**, **Fee Collection Record**.
- `docs/adr/0015-…-fee-adjustment.md` · `docs/adr/0016-per-instance-workflow-approver.md`
- Map #434's **"Not yet specified"** section — seven decisions from the fog-grilling session.
- Amendments on [#436](https://github.com/salmansrizon/Amar_school_LMS/issues/436) and [#438](https://github.com/salmansrizon/Amar_school_LMS/issues/438), which correct their own originals.

## Open threads

**ADR 0016 has no consumer and its premise is dead.** It proposed a per-instance workflow approver so student leave could route to the Class Teacher. Then #452 revealed the shipped leave queue is a **plain `status` column**, not the workflow engine — `lib/school/leave-approval.ts` exists but **nothing imports it**. And #456's own text says *"only the School Owner changes it"*. So both candidate consumers went elsewhere. **The ADR should be marked superseded or deleted**; building the capability now would be speculative generality. Raise it with the user.

**#445 has one bullet deliberately unimplemented.** A class teacher may post to their own class "**and only their own class**" — the second half is not enforced, because the same policy is what lets the Owner and office staff post for any class. Recorded on the issue; wants its own decision.

**Architecture review** — candidate 1 shipped as PR #506. Still outstanding and rated **Strong**: **#2** the write path has no test surface (185 actions, 4,387 LOC, no test imports any); **#3** Class is three modules with two live label formats; **#4** production crons run under `anon`'s 3s `statement_timeout`. Report regenerates via `/improve-codebase-architecture`.

**`/improve-codebase-architecture` is overdue** — `web/AGENTS.md` wants it every 3 tickets; ~13 have shipped since the last. User-invoke only; ask.

**Two tickets the user asked about and were never filed:** `revoke_student_login`, and the subscription-sweep fixture pruning.

## Test state

`npm run typecheck` clean · **818 unit** · **513/520 integration**. The 7 failures are two suites, **neither caused by this map** — each verified by removing the relevant guard and re-running:

| Suite | Cause |
|---|---|
| `seat-plan-v2` (6) | `ST504 ScopeCheck` students — the *other developer's* in-flight test data — sit in the fixture's reused classes and break its room-capacity arithmetic. **Do not delete their rows.** |
| `subscription-sweep` (1) | ~17.5k `t-%` fixture billing runs vs 271 real; the sweep now exceeds `anon`'s 3s timeout. |

Both share one root cause: **integration suites share one live database with two developers and clean up by name prefix**. Proposed fix — a per-run School torn down by `0068`'s cascade — was put to the user and is undecided.

## Suggested skills

- **`/grill-with-docs`** — required before the merge; also the right tool for the ADR 0016 question.
- **`/code-review`** — it caught real security holes on this map twice, including one in my own work.
- **`/improve-codebase-architecture`** — ask the user; it refuses model invocation.
- **`/domain-modeling`** — write decisions to `CONTEXT.md` or an ADR as they crystallise, not in a batch.

## Gotchas that cost time

- `exam_marks.obtained_marks` is a **generated** column — never insert it.
- `attendance_records` has **no INSERT policy** for school members; the reconcile job writes it as definer, so fixtures cannot forge a row.
- `reconcile_attendance` filters on `schools.automatic_attendance_enabled`. A suite left it `false` and broke three unrelated suites.
- Print **themes** are admit-card only; mark sheets take `?template=1|2|3`.
- `publications.target_shift_id` is dead (`0060` removed student Shift). Never filter on it. **Confirmed twice more since**: map #582's Wave 0 audit (#583) re-verified this via migration history (`0060` dropped the column; a later reference in `0139` is comment-only, never re-added) and a live-schema query (0 rows) — this line was right the first time.
- Deriving which screen owns a table? **Follow `@/lib` imports transitively** — scanning only `app/` mis-assigned four tables in PR #506.
- `absent_working_days_in_range` is the single definition of a working day, shared with the absent-fine formula and the absence-SMS rules. Never recompute it.
