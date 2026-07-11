# Parallel wayfinder tickets — agent log

Live tracker for the parallel implementation of school-owner module tickets (#28-#39, #47-#48), per user direction 2026-07-10 to run agents in parallel rather than the map's normal strictly-serial cadence. Update this file whenever a ticket's status changes so a disrupted session (API limit, crash) can resume from here instead of re-deriving state.

**Concurrency policy (since 2026-07-11):** max 2 implementation agents running at once. Wait for one to land on staging before starting the next from the queue below.

**Review tool:** use `/code-review` skill, NOT greploop/Greptile CLI.

**Dependency chain (real, not the artificial pacing chain):** 28 → 29 → 30. 31 → 47 → 32 → 33 → 48. 34 → 35. 36 needs 28. 37/38/39 independent.

## Status

| Ticket | Branch | Status | PR | Notes |
|---|---|---|---|---|
| #28 Employees | feat/28-employees-1 | **owned by another session** — do not touch | #56 open | Not ours; left alone |
| #29 Attendance I | feat/29-attendance-1 | **owned by another session** — do not touch | #57 open | Worktree at `.claude/worktrees/feat-27-students-1`, locked |
| #30 Attendance II | — | blocked on #29 merging | — | Not started |
| #31 Exams I | feat/31-exams-1 | **DONE, merged** | #58 merged | 39 new tests. Migration 0037_grading_schemes.sql |
| #47 Exams II | feat/47-exams-2 | **DONE, merged** | #63 merged | 36 new tests. Relaunched fresh after the prior agentId's worktree was auto-cleaned. Migrations 0044_exam_setup_routine_seatplan.sql + 0045_seat_plan_clear_publish_on_change.sql (renumbered 0039→0044; 0039-0043 taken by #34/#37/#39 while in flight — rename only, live migration already applied under its own timestamp version). Exam setup gains class/start_date/grading_scheme_id (picks one of #31's named schemes); `exam_subject_teachers`, `exam_routine_entries` (+print), `exam_seat_plans` (room-capacity DB trigger, duplicate-range/overlap server-checked by `publish_seat_plan`, `generate_seat_plan` auto-partitions the roster); all three extend issue #8's Closed-exam immutability. Reviewed via `/code-review` (Standards+Spec): fixed a publish-invalidation gap (editing/regenerating seat-plan rows after publish now clears the publish marker via a new 0045 trigger) plus minor UI/lib-hoisting findings. Issue closed with resolution comment; #24 Decisions so far updated.|
| #32 Exams III | — | blocked on #47 | — | Not started |
| #33 Exams IV | — | blocked on #32 | — | Not started |
| #48 Exams V | — | blocked on #33 | — | Not started |
| #34 Accounting I | feat/34-accounting-1 | **DONE, merged** | #61 merged | Fee structures + copy-between-class/year, deepened Fee/Fine/Scholarship collection UI, absent-fine calculator (`absent_working_days_in_month` RPC reuses `is_absent_working_day`). Migrations renumbered 0037→0039 (`fee_structures`), 0038→0040 (`fee_collection_records.note`) — collided with #31/#38, which merged first. |
| #35 Accounting II | — | blocked on #34 | — | Not started |
| #36 SMS | — | blocked on #28 merging | — | Not started |
| #37 Publishing | feat/37-publishing-1 | **DONE, merged** | #62 merged | 26 new tests. Migration renumbered 3x during flight (0037→0038→0039→0041 for publishing, →0042 for the bucket-size fix) as #31/#34/#38 landed migrations ahead of it; final numbers 0041/0042. Reviewed via `/code-review` (Standards+Spec): fixed orphaned-upload cleanup on notice-image insert failure + gallery bucket size ceiling (5MB→20MB) mismatched against the per-album configurable range. |
| #38 Feedback | feat/38-feedback-1 | **DONE, merged** | #59 merged | 28 new tests. Migration 0038_feedback.sql. Tenancy trigger on replied_by, AddDetails deduped, dead i18n key fixed |
| #39 Institute Setup | feat/39-institute-setup-1 | **DONE, merged** | #64 merged | 29 new tests. Migration renumbered 2x during flight (0037→0039→0043) as #31/#38 then #34/#37 landed migrations ahead of it. Institute profile deepens `schools` (reuses existing `location_id`/`cluster_id`, no duplication), daily checklist + date-range report, logistics index, 5 blank print templates on the ADR 0007 seam. Reviewed via `/code-review` (self-conducted after the spawned sub-agents didn't report back in time — no findings required fixing). |

## Agent IDs (internal — for resuming via the orchestrator's SendMessage tool; not GitHub-facing)

- #31: a02db67f9fa1bedab — DONE
- #34: a16025b75a4654ada — DONE
- #37: a356fae1ef12a11fa — DONE
- #38: a56a85063df6fd727 — DONE
- #39: acf80a45999337a7b — DONE
- #47: a890de4107a85ffd1 (original, worktree auto-cleaned, never resumed) → relaunched fresh, worktree `.claude/worktrees/agent-a1246ac3cf0dc8435` — DONE

## Known gotchas hit so far

- Session limit gets hit mid-run; the error message gives a reset time (Asia/Dhaka). Resume via a message to the same agentId once past reset — do NOT relaunch fresh unless `git worktree list` shows the worktree is gone (that means zero file changes were made and the ticket must restart from scratch).
- Migration number collisions: #31 got 0037 first (merged), #38 got 0038 (merged), #34 renumbered its two migrations to 0039/0040 at merge (merged). #37 hit this three times in a row (0037→0038→0039, chased by each of #31/#38/#34 landing first) before settling at 0041/0042 (merged). #39 hit it twice (0037→0039, chased by #31/#38; then 0039→0043, chased by #34/#37) before settling at 0043 (merged) — re-check `web/supabase/migrations/` on `origin/staging` right before every push, not just once, when several siblings are merging around the same time. #47 picked 0039 early (no collision yet at apply time) but had to rename-only to 0044 right before merging once it saw 0039-0043 taken by #34/#37/#39 (merged first) — 0046+ is next free as of #47 merging.
- The `/code-review` skill's Spec sub-agent can keep working past its report and try to apply its own fixes directly in the shared worktree — the harness's isolation guard correctly blocked it mid-write when the parent agent (this ticket's own session) was concurrently editing the same files, and it stopped rather than route around the guard via raw shell writes. No harm done (findings matched what the parent already fixed independently), but don't assume a review sub-agent is purely read-only — treat its "report" as the deliverable and don't hand it further turns unless you want it acting on the worktree.
- `web/lib/i18n.ts` and the school home/module nav files are shared — resolve merge conflicts by keeping both sides' added blocks, never drop a sibling ticket's keys.
- staging is not the GitHub default branch, so "Closes #N" in a PR body does NOT auto-close the issue on merge — close manually with a resolution comment (see #31, #38 precedent).
- Live-Supabase integration tests are shared across all parallel sessions hitting the same DB — expect occasional unrelated flaky failures (e.g. `absence-sms.test.ts`) from sibling branches; re-run before treating as a regression. With 3+ sibling sessions running full suites concurrently, whole-suite runs can show widespread failures (10-20 files) that clear up when the same files are run individually or alone — this looks like Supabase Auth rate-limiting under concurrent login volume, not a real regression. Verify by running just your own new test file(s) in isolation; don't chase a fully-green whole-suite run while several siblings are mid-flight.
- A `/code-review` sub-agent's report can fail to route back to its parent agent (bad address) — if that happens the report lands on the orchestrator instead, which then relays it to the right agent manually.
