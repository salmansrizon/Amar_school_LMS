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
| #47 Exams II | feat/47-exams-2 | in progress | — | agentId a890de4107a85ffd1 (hit a session-limit failure mid-run; resume via SendMessage if it stalls) |
| #32 Exams III | — | blocked on #47 | — | Not started |
| #33 Exams IV | — | blocked on #32 | — | Not started |
| #48 Exams V | — | blocked on #33 | — | Not started |
| #34 Accounting I | feat/34-accounting-1 | in progress | — | Migration 0037_fee_structures.sql — renumber at merge (collided with #37/#31) |
| #35 Accounting II | — | blocked on #34 | — | Not started |
| #36 SMS | — | blocked on #28 merging | — | Not started |
| #37 Publishing | feat/37-publishing-1 | in progress | — | Migration 0037_publishing.sql — renumber at merge |
| #38 Feedback | feat/38-feedback-1 | **DONE, merged** | #59 merged | 28 new tests. Migration 0038_feedback.sql. Tenancy trigger on replied_by, AddDetails deduped, dead i18n key fixed |
| #39 Institute Setup | feat/39-institute-setup-1 | in progress | — | Relaunched fresh (first attempt's worktree auto-cleaned, no files written) |

## Agent IDs (internal — for resuming via the orchestrator's SendMessage tool; not GitHub-facing)

- #31: a02db67f9fa1bedab — DONE
- #34: a16025b75a4654ada — in progress, worktree `.claude/worktrees/agent-a16025b75a4654ada`
- #37: a356fae1ef12a11fa — in progress, worktree `.claude/worktrees/agent-a356fae1ef12a11fa`
- #38: a56a85063df6fd727 — DONE
- #39: acf80a45999337a7b — in progress, worktree `.claude/worktrees/agent-acf80a45999337a7b`
- #47: a890de4107a85ffd1 — in progress, worktree `.claude/worktrees/agent-a890de4107a85ffd1` (check `git worktree list`; if missing, the worktree was auto-cleaned and the ticket must be relaunched fresh instead of resumed)

## Known gotchas hit so far

- Session limit gets hit mid-run; the error message gives a reset time (Asia/Dhaka). Resume via a message to the same agentId once past reset — do NOT relaunch fresh unless `git worktree list` shows the worktree is gone (that means zero file changes were made and the ticket must restart from scratch).
- Migration number collisions: #31 got 0037 first (merged). #34 and #37 both also picked 0037 before merging — each must re-check `web/supabase/migrations/` on `origin/staging` right before merge and renumber if taken.
- `web/lib/i18n.ts` and the school home/module nav files are shared — resolve merge conflicts by keeping both sides' added blocks, never drop a sibling ticket's keys.
- staging is not the GitHub default branch, so "Closes #N" in a PR body does NOT auto-close the issue on merge — close manually with a resolution comment (see #31, #38 precedent).
- Live-Supabase integration tests are shared across all parallel sessions hitting the same DB — expect occasional unrelated flaky failures (e.g. `absence-sms.test.ts`) from sibling branches; re-run before treating as a regression.
- A `/code-review` sub-agent's report can fail to route back to its parent agent (bad address) — if that happens the report lands on the orchestrator instead, which then relays it to the right agent manually.
