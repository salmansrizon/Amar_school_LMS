# Handoff — owner UI overhaul: staging sync + workflow audit (2026-10-03)

State a fresh session cannot rebuild from the repo alone. Last updated
2026-10-03 ~12:30 (Asia/Dhaka). Update the "Live state" and "Audit" sections
whenever they change.

## Goal

Merge `feat/owner-ui-overhaul` (owner UI redesign) into `staging` without
losing any staging feature. Plan agreed with the user: bring staging into the
local branch first, verify nothing from staging is dropped, then the user
merges the local branch into `staging`.

## Where the work is

| Thing | Location |
|---|---|
| Result branch | `merge/staging-sync`, worktree `.claude/worktrees/staging-sync` |
| Head commit | `f92793a` (check with `git -C .claude/worktrees/staging-sync log --oneline -5`) |
| Local branch | `feat/owner-ui-overhaul` still at `13db5c5` — NOT moved |
| Staging | `origin/staging` at `4e6f955`, fully contained in `merge/staging-sync` |
| Nothing is pushed | no PR opened |

Commits on `merge/staging-sync` on top of `feat/owner-ui-overhaul` (`13db5c5`):

1. `7d3aadf`, `f391411` — Recent Admissions on `DataTable`; `DataTable` hides
   its keyboard-shortcut bar when the table has no toolbar.
2. `158bdac` — calendar polish: shared `CalendarToolbar` / `MonthGridFrame`
   for the three attendance calendars, plus the browser-check fixes.
3. `3d6b1aa` — jev-ultrafast agentic e2e suite removed (`web/e2e/agentic/`,
   `test:agentic` script). The external checkout `~/tools/jev-ultrafast` is
   deleted too. The `jev` MCP server (user scope) replaces it.
4. `21b3f6c` — merge of `origin/staging` (21 conflicts resolved; see below).
5. `61e84cd` — the user's uncommitted UI edits copied from the main checkout
   (collapsible sidebar sections, login/auth card, footer, PNG icon, etc.).
6. `f92793a` — filter controls share one height (`FIELD_HEIGHT` in
   `web/components/ui/field.ts`: 44px phone, 40px from `sm`).

## Merge decisions (commit `21b3f6c`)

Staging's behaviour wins wherever the two disagreed; the overhaul's layouts
sit on top.

- Nav: overhaul's grouped sidebar keeps staging's indented Attendance children
  (Off-Day Calendar, Students, Employees, Machine). `alsoMatches` was folded
  into staging's `matchPrefixes` (`web/lib/school-nav.ts`).
- `attendance-tabs.tsx`: no top group row (staging); sub-nav is a
  `SegmentedControl` with an `extra` toolbar slot.
- Leave pages: staging's request-leave roster + modal above the overhaul's
  `DataTable` + drawer.
- Employees list/profile: grace settings, Office Time toggles and RFID rows
  removed, as staging did — including inside `employee-profile.tsx` and
  `student-profile.tsx`, which the overhaul had split out.
- Migration `0208_student_attendance_summary.sql` renumbered to `0214`
  (staging owns `0208`). It is still a DRAFT: apply it to the staging database
  by hand. Until then `lib/school/attendance-rate-source.ts` returns null and
  pages hide the attendance-rate column.

Verified with jev (`jev_verify`, 11/11 claims): staging fully contained, no
staging file missing, no deleted function re-added, no reference to a dropped
table or column, no duplicate migration number in 0208–0214.

## Open items before merging to staging

1. **Move the local branch.** The main checkout has uncommitted edits, now
   duplicated in `61e84cd`. The user must choose: commit/discard them and
   fast-forward `feat/owner-ui-overhaul` to `merge/staging-sync`, or open the
   PR from `merge/staging-sync` directly. Do not discard their edits without
   asking. Left out of `61e84cd` on purpose: untracked docs, screenshots,
   `ui/login-preview.html`, `web/e2e/live-check.mjs`, `web/supabase/supabase/`.
2. **Dependency.** Staging added `@typesafe-ai/sdk ^0.6.0`. It is installed in
   the main `web/node_modules` with `--no-save`. A clean checkout needs
   `npm install`.
3. **Not yet run on the merged branch:** the full Playwright e2e suite and the
   database integration tests (`vitest tests/integration` fails locally —
   database not reachable from here; cause unconfirmed).
4. **Known lint error, pre-existing:** `web/app/claim/page.tsx:33`
   (`setState` inside an effect).
5. **Non-UI points raised by the jev review of the branch (verdict: escalate):**
   - "All students" SMS now pages past 1,000 rows — larger schools use more
     credits per send.
   - `lib/school/fee-standing-source.ts` ignores query errors (a failed read
     looks like "no fee record").
   - CSP `frame-src` is `'self'` on every page (report-only policy).
   - `bulkRemindStudents` does not URL-encode ids (low risk).
6. **Calendar leftovers:** view switch + toolbar width on phones is tight;
   the Leave Calendar 3+-leaves-on-a-holiday case was fixed but not re-created
   in a browser.

## Live state

- Dev server: `npx next dev --webpack --port 3700` run from
  `.claude/worktrees/staging-sync/web` (Turbopack does not boot in worktrees
  because `node_modules` is a symlink). It dies with the Claude session;
  restart it the same way. `.env.local` and `node_modules` there are symlinks
  to the main checkout's.
- Owner login state for scripts:
  `.claude/worktrees/agent-ae148a78d57cc03b6/web/e2e/.auth/owner.json`
  (also `classteacher.json`, `staff.json`, `student.json`). If expired, log in
  with the fixture accounts in `web/e2e/global.setup.ts`.
- Scratch output (session-specific, may be gone in a new session):
  `/private/tmp/claude-501/-Users-salmansakib-Documents-Projects-Amar-school-LMS/399aafbf-bab1-431e-88cf-84be3830daba/scratchpad/`

## Audit: finished

Five agents audited School Owner / Head Teacher workflows on localhost:3700
(branch `merge/staging-sync`). Reports are saved in the repo, uncommitted:
`docs/testing/owner-workflow-audit-2026-10-03/` — start with `README.md`
(combined list ranked by `jev_rerank`, shared root causes, workflow scores,
decisions needed, leftover test data).

Totals: 185 findings — 3 blockers, about 60 major. Blockers:

1. A class teacher can publish/save/delete/close another class's exam
   (`/school/exams/<id>`, no server-side ownership check).
2. Exam publish/unpublish is one click with no confirmation.
3. Employee search crashes for any query (`web/app/school/employees/page.tsx:145`,
   `(e.unique_id ?? '').toLowerCase is not a function`). Reproduced by hand;
   the same line is on `feat/owner-ui-overhaul`.

Not established: whether these also exist on `staging` today.

Nothing from the audit has been fixed. Next step: ask the user which findings
to fix and in what order (the README ranking is the default).

**Test data left in the Test School A database** — listed in the README's last
section. It needs a database cleanup (no delete in the app). It includes one
approved leave on a real staging employee ("Staging Teacher Two", Oct 4–5) and
one still-active staff login ("UXA-People Emp Test").

## Fix wave 1 — plan (agreed in a grilling session, 2026-10-03)

Decisions the user made:

1. Fix on `merge/staging-sync` everything that needs **no migration and no
   change to staging**. Anything needing a migration, or changing documented
   behaviour, becomes a **GitHub issue** for review. Another developer is
   working on `staging` — do not touch it.
2. Exam access (a class teacher can change another class's exam) and
   attendance access (teachers can manage machines / Grace Time / Office Hour)
   are documented design (CONTEXT.md "Permission Grant", ADR 0021, ADR 0029):
   **issue only, no code change**. This wave adds the publish confirmation.
3. **Build notice edit + unpublish** in this wave. The subscription page gets
   its own research + grilling session later — not built now.
4. Cross-cutting: do formats (money, dates, Bangla digits) and accessibility
   now. Bangla wording: write a **glossary proposal** for the user's approval;
   change no wording until approved.

Facts established: exam, fee, receipt, notice and attendance server actions are
identical on `staging` and `merge/staging-sync`, so those bugs already exist on
staging. `saveFeeRecord` permission finding downgraded to "verify" — migration
`0136_staff_screen_grants_rls.sql` covers `fee_collection_records`.

Execution (status: see "Fix wave 1 — progress" below once it exists):

- Phase A, in parallel, each agent in its own worktree branched from
  `merge/staging-sync`, own dev server port:
  people (3701), attendance (3702), academics (3703), finance + notices (3704);
  plus a GitHub-issues agent and a glossary-proposal agent (no app code).
- Phase B, after Phase A branches are merged into `merge/staging-sync`:
  cross-cutting sweep (formatters, shared dialog, labels, skip link, titles,
  contrast, tap targets).
- Phase C: independent evaluation of the merged result (tests, browser re-run
  of the audited workflows, `jev_review` + `jev_verify`).

Each agent must: stop and write an issue note instead of adding a migration;
run tsc, eslint, unit tests; re-run the audited workflow in a browser; run
`jev_review` on its own diff; commit on its branch; never push.

## Rules the user set this session

- Spawn subagents only when asked; use Sonnet for audit agents (session limit).
- Do not run `npm install` without asking.
- jev (`mcp__jev__*`) reviews and validates changes and claims.
- Commit only on worktree branches; never push or merge to `staging` — the
  user does that.

## Fix wave 1 — progress

Update this section at every milestone.

- 2026-10-03 ~15:00 — Phase A launched (6 background agents). Implementers
  work in isolated worktrees under `.claude/worktrees/agent-*`, each reset to
  `merge/staging-sync` (`f92793a`), committing on their own
  `worktree-agent-*` branch:
  - Academics (Opus 5.5, dev port 3703)
  - Finance + notices + dashboard (Opus 5.5, port 3704)
  - Attendance + leave (Sonnet 5.5, port 3702)
  - People (Sonnet 5.5, port 3701)
  - GitHub issues (Haiku 4.5) — 12 issues in `salmansrizon/Amar_school_LMS`
  - Glossary proposal (Sonnet 5.5) →
    `docs/testing/owner-workflow-audit-2026-10-03/glossary-proposal.md`
- 2026-10-03 — GitHub issues agent finished; the 12 issues are open in
  `salmansrizon/Amar_school_LMS` (checked with `gh issue list`):
  #676 exam actions vs class attachment, #677 attendance permission scope,
  #678 store the fee amount on fee records, #679 marks absent vs not-entered,
  #680 leave rejection reason, #681 director capital reconcile,
  #682 subscription page (needs research), #683 fee void/reversal,
  #684 apply migration 0214, #685 audit coverage gaps, #686 clean test data
  from Test School A, #687 verify `saveFeeRecord` permission.
- 2026-10-03 13:24 — implementer snapshot (all four still running; the
  "~15:00" launch time above is wrong, launch was about 13:10):

  | Area | Branch | Commits so far | Uncommitted files |
  |---|---|---|---|
  | Attendance + leave | `worktree-agent-a3e7c80a36b2f510c` | `9dafcda` no absences before enrolment, holiday-aware employee status, rate over marked classes | 2 |
  | People | `worktree-agent-a08b9d476a79bb20c` | `6908e93` employee search crash, mobile validation, roll-duplicate and form errors | 14 |
  | Academics | `worktree-agent-a104abd5a6a69b95f` | none | 11 |
  | Finance + notices | `worktree-agent-a9c7095aab80bb5fb` | none | 2 |

  Worktrees are at `.claude/worktrees/agent-<id>`. Uncommitted work there is
  lost only if the worktree is removed — check `git -C <worktree> status`
  before cleaning up. Glossary proposal: file not written yet.
  Nothing is merged into `merge/staging-sync` yet (still `f92793a`).
- 2026-10-03 ~13:30 — all five remaining agents died at the session rate
  limit. Work on disk survived.
- 2026-10-03 22:18 — the same five agents resumed (same ids, same worktrees),
  told to commit after each group of fixes. State at resume:
  - Attendance: `9dafcda` + 5 uncommitted files (mark page, i18n).
  - People: `6908e93`, `734af61`, clean tree; browser re-check and report left.
  - Academics: no commit; 12 edited files + `web/lib/exam-readiness.ts`,
    `web/tests/unit/exam-marks-publish.test.ts`; publish dialog in progress.
  - Finance + notices: no commit; 9 edited files (fees, receipt, student
    count); SMS confirmation and notice edit/unpublish not started.
  - Glossary proposal: file not written.
- 2026-10-03 ~22:30 — glossary proposal written:
  `docs/testing/owner-workflow-audit-2026-10-03/glossary-proposal.md`
  (20 concepts with competing terms, change list A–N, 9 questions Q1–Q9 for
  the user). Waiting for the user's answers; no wording changed. It also
  lists the ৳ sites that bypass the shared formatter and the leaking English
  strings with file:line — input for the Phase B sweep.
- 2026-10-03 22:21 — **People merged.** `merge/staging-sync` fast-forwarded
  to `734af61` (`6908e93` + `734af61`, 27 files). tsc clean, unit tests
  1464/1464. Fixed: employee search crash, mobile validation
  (`web/lib/bd-mobile.ts`), friendly roll-duplicate and form errors, save
  toasts, archive → redirect, incomplete-profiles filter (`incomplete=1`),
  stat tiles hidden without permission, Bangla-digit search, long names.
  Not confirmed in a browser: duplicate-roll message (two students with the
  same roll saved without error — the constraint did not fire), employee
  archive warning, employee/transfer toasts. jev_review of that diff:
  escalate (0.61, reason: test gap on server actions/components).
  Issues still to file from this agent (file once all four have reported, to
  avoid duplicates): (1) revoke/disable the staff login when an employee is
  archived — no such action exists, only a warning + link was added;
  (2) approvals inbox and dashboard count are school-wide for any member.
  Test data added: three archived students "FIX-People 2026100307…".
- 2026-10-03 22:23 — **Attendance + leave merged.** `merge/staging-sync` at
  `75c12a8` (merge of `9dafcda`, `62ea0f4`, `d05b04c`; no conflicts with
  People). tsc clean, eslint 0 errors, unit tests 1484/1484. Fixed: no
  "absent" before admission/joining, leave badge on the mark page and L/H in
  the Book, dashboard rate over marked classes only, holiday-aware employee
  status, off-day banner, unsaved-changes confirm, phone flow (auto-open the
  only class, apply on pick), undo toast on leave approve (new `revertLeave`
  action), confirm on reject, one filter bar on leave pages, class-teacher
  counts scoped to their students.
  Not confirmed in a browser: leave badge behaviour, undo toast, reject
  confirm, employee calendar before joining, employee list/table holiday
  status, and the `employees.joining_date` read as a non-owner (RLS may
  return nothing, so no clipping for staff roles). Phase C must check these
  and review `revertLeave` (who may call it). jev_review: escalate (0.44,
  low confidence, summary-only input).
  Issues still to file: default sidebar link for the Employees attendance
  group (Office Hour first per ADR 0029); dated holiday list view (only
  relabelled to "Year"); expose joining date to attendance pages for
  non-owner roles; employee calendar approved leave + "no record" state.
  Rejection reason is already #680.
- 2026-10-03 ~22:35 — user asked for an agent to fix the **non-migration
  issues among #676–#687**, with the condition that existing core functions
  are not replaced; jev evaluates. This overrides the earlier "issue only"
  decision for #676. Launched (Opus 5.5, own worktree from `75c12a8`, dev
  port 3705, branch `worktree-agent-a5726b0d66138695c`). Rules given:
  additive guards only, no signature/behaviour change for existing callers,
  owner unaffected, reuse the existing class-scope helper for #676, new logic
  in new files because the academics and finance agents are editing
  `exams/[id]/actions.ts` and `fees/actions.ts`. Expected FIX: #676, #687,
  maybe a display part of #681. Expected SKIP: #677 (ADR 0029 design),
  #678/#679/#680/#683 (migration), #682/#684/#685/#686 (not code).
  When it reports: merge after academics and finance, then run `jev_review`
  on its real diff and check the "Core functions" section of its report.
- 2026-10-03 22:32 — **Finance + notices merged.** `merge/staging-sync` at
  `e779153` (merge of `d240e85`, `d913246`, `e4e1daf`, `f4b51fe`). Three
  conflicts resolved keeping both sides: `students/directory-rows.ts` and
  `students/page.tsx` (People's `incomplete` + Finance's `month`/`year`),
  `components/confirm-dialog.tsx` (`extra` + `triggerDisabled` /
  `confirmClassName` / multi-line body). tsc clean, eslint 0 errors, unit
  tests 1505/1505.
  Fixed: receipt ledger lookup (query ordered by a non-existent column
  `created_at`; it is `posted_at`), overpayment needs an "advance" tick and
  `saveFeeRecord` now computes due server-side, dues links keep the month,
  SMS confirm with recipients × parts and balance, fee edit form derives the
  fee, notice edit page (`notices/[id]/edit`), notice delete via app dialog,
  dashboard student count follows the academic-year selection, unknown
  `/school/<x>` shows not-found, director capital carry-over line.
  Not built: notice unpublish (needs a column + RLS), album edit.
  **Behaviour change to tell the user:** a received amount with the fee left
  at 0 now counts as overpayment — schools with no fee structure must enter
  the fee or tick the advance box. Two e2e specs were edited for this and
  NOT run (`school.fees.deep.spec.ts`, `school.sms.spec.ts`).
  Finding: `tests/integration/accounting-ii.test.ts` deletes capital rows as
  the owner on the shared database; the balance trigger is insert-only, so
  Test School A's director capital balance has drifted by ৳13,14,000.
  jev_review: escalate (0.51; 8 of 26 files reviewed, no named defect).
  Issues still to file: carry advance payment forward or block overpayment;
  notice unpublish; capital balance not reversed on delete; real 404 vs the
  fail-closed proxy (#515); SMS balance wording when metering is off.
  (Fee amount column is #678; `saveFeeRecord` grant check is #687.)
  Test data added: fee record `ed8bb9f9-42fa-42c8-849b-7cf0c44bad71`
  ("UXA-Att Jannat Ara", November 2026, ৳500).
- 2026-10-03 ~22:50 — **Issue status check** (user asked: close completed
  issues, keep or create issues for the rest; jev validates). Result at
  `e779153`, checked with `jev_verify` (9/9 claims verified, confidence
  ≥ 0.99): **no issue in #676–#687 is completed, none closed.**
  - Partly done, progress comment posted, kept open: #678 (form derives the
    fee; column still needed), #680 (undo + confirm; no stored reason),
    #681 (cause found, extra line shown; balance not reconciled).
  - Waiting on running agents: #676, #687 (issues agent), #679 (academics).
  - Untouched: #677, #682, #683, #684, #685, #686.
  - New follow-up issues created from the fix agents' leftovers:
    #688 archive leaves staff login active, #689 approvals school-wide for
    any member, #690 duplicate roll saved in one class (needs
    investigation), #691 Employees attendance default sidebar link,
    #692 dated holiday list, #693 attendance start date for non-owner roles,
    #694 employee calendar leave + no-record state, #695 overpayment
    carry/block/keep, #696 notice unpublish, #697 soft 404 on unknown
    `/school` routes.
  - Not filed: SMS balance wording when metering is off (minor, ask user).
  - Rule proposed to the user: do not close an issue until its fix is on
    `staging`; until then comment "fixed on merge/staging-sync".
- 2026-10-03 22:45 — **Phase A complete: all branches merged.**
  `merge/staging-sync` at `9d59d79`. Order merged: People `734af61` →
  Attendance `75c12a8` → Finance `e779153` → Issues #676/#687/#681
  `dab5c72` → Academics `9d59d79`. Since `f92793a`: 107 files, no migration
  file changed. tsc clean, eslint 0 errors, unit tests 1550/1550.
  Conflict notes: `director-capital/page.tsx` took the opening-balance cards
  (issues agent) over the finance agent's extra line; `confirm-dialog.tsx`
  now carries overlapping props from three agents (`extra` + `children`,
  `confirmClassName` + `confirmTone`) — tidy in Phase B.
  - Issues agent: #676 guard on 7 exam-level actions
    (`web/lib/school/exam-class-guard.ts`), #687 explicit fees grant check
    (`web/lib/auth/require-grant.ts`), #681 opening balance. Nothing
    replaced; signatures unchanged. My `jev_review` of the real guard diffs:
    **escalate**, composite 0.75, safe_to_apply 0.49 (limits: test gap on
    the guard, blast radius on the actions; no defect named).
    Open risks for Phase C: guard fails open when `app_class_scope` errors;
    teacher-on-own-class path not browser-tested; RLS unchanged; child
    actions (routine, seat plan, marks, promotion) unguarded; buttons still
    shown. Decisions: Subject Teachers allowed; class-less exam open.
  - Academics: publish/unpublish confirm with readiness check (server
    re-checks), blank marks not saved as 0, incomplete state in result book /
    promotion / mark sheet, merit tie-break by total, band-less scheme
    blocked, one status chip, routine overlap check, toasts.
    Behaviour changes: a half-filled marks row is refused; publish blocked
    with no class or no grading scheme. Old all-zero rows still inflate list
    progress. Possible bug seen, not triaged: switching subject on a directly
    loaded marks page opens the new subject in the route popup.
  - Progress comments posted on #676, #679, #681, #687. All stay open until
    merged to `staging`; #687 is ready to close then.
  - Academics leftovers not yet filed as issues: clean all-zero
    `exam_marks` rows; routine overlap across exams + DB constraint; marks
    save not atomic; list progress vs roster; student portal / progress
    report still show incomplete as failed.
  - The owner login state file has expired (smoke script lands on /login).
    Log in again with the fixture accounts before any browser check.
  - Next: Phase B cross-cutting sweep, then Phase C evaluation.
- 2026-10-03 ~23:15 — **Requirement check + staging check + decisions.**
  - `origin/staging` still at `4e6f955` (checked with `git ls-remote`);
    `merge/staging-sync` is 0 behind / 150 ahead. Nothing new to adopt.
  - `jev_verify` against code at `9d59d79`: 14 audit requirements verified
    done (AC1 action layer, AC2, AC6, AC9, FI1, FI2, FI3, FI4, FI11, AT2,
    AT3, AT7, PE1, PE3). Confirmed NOT done: AC5 list progress still counts
    all-zero rows (#698), AC3 no absent option (#679), FI5 notice unpublish
    (#696), AT1 attendance permission scope (#677, design).
  - **Decision (user): the branch to merge into staging is
    `merge/staging-sync`.** The user opens the PR from it.
    `feat/owner-ui-overhaul` and the main checkout's uncommitted work are
    left untouched.
  - **Decision (user): build all four non-migration leftovers now.**
  - #687 closed as completed (user asked to close completed issues). All
    others remain open.
  - New issues from academics: #698 clean all-zero marks rows, #699 routine
    overlap across exams + DB constraint, #700 marks save not atomic,
    #701 marks-entry subject switch opens popup.
  - Agents running (each in its own worktree from `9d59d79`, commit per
    part, never push):
    - Phase B sweep (Sonnet 5.5, port 3706),
      `worktree-agent-a46a01f12e9500280`: money/date/digit formatters,
      dialog accessibility + `ConfirmDialog` prop merge, labels, skip link,
      page titles, contrast, tap targets. Uses the glossary's recommended
      formats (Q5–Q8); no wording changes.
    - Exam guard completion + incomplete results in portal/progress report
      (Opus 5.5, port 3707), `worktree-agent-a7540d7bbb37fbbf4`.
    - Employee leave on calendar (#694 first half) + holiday list (#692)
      (Sonnet 5.5, port 3708), `worktree-agent-a2e623830df323df0`.
  - Then: merge the three, checks, Phase C independent evaluation (fresh
    login needed), final issue pass, report. Glossary questions Q1–Q4, Q9
    still wait for the user.
- 2026-10-03 22:56 — **Attendance leftovers merged.** `merge/staging-sync`
  at `0296298` (merge of `ca4104a`, `2b96412`; no conflicts). tsc clean,
  eslint 0 errors, unit tests 1560/1560. Approved employee leave shows as
  leave on the employee calendar and table (pages pass `leaveBeatsOff`);
  new `?view=holidays` list on the Off-Day Calendar (`buildOffDayList`).
  #692 closed; #694 commented, open for the "no record" state. Not browser
  checked: per-employee month page, English UI. jev_review: escalate
  (0.60, low confidence, no defect named).
  Still running: Phase B sweep, exam guard completion.
- 2026-10-03 23:13 — **Phase B merged.** `merge/staging-sync` at `595b012`
  (merge `548ec2f` of 9 commits, 133 files, no conflicts, plus my re-export
  commit). tsc clean, unit tests 1570/1570, eslint: only the known
  `app/claim/page.tsx:33` error.
  - Done: `formatMoney` / `formatDate` / `formatTime` / `formatNumber` in
    `web/lib/i18n.ts`; native `<dialog>` for `Modal` and `ConfirmDialog`
    (`web/components/native-dialog.tsx`; props merged to `children` and
    `confirmTone`); input labels (0 unlabeled on the scanned pages); skip
    link first; contrast tokens in `globals.css`; 66 page titles.
  - Partly: page titles (dashboard and ~40 dynamic-heading pages still
    "EdumeBD"); tap targets (e.g. students 104 → 24 under 44px).
  - **Behaviour changes to confirm with the user:** `localeOf('en')` is now
    `en-IN` (lakh grouping in English everywhere `numberFmt` is used,
    student pages included) — this followed the glossary default Q8, which
    the user has not answered; dialogs are now centred on phones (Modal was
    top-aligned); colour tokens changed (`muted`, `sun-deep`, `alert-deep`,
    `sky-deep`, dark `brand-500`), and `ui/shared/design-system.css` was
    NOT updated to match.
  - `lib/student/metadata.ts` had been deleted (moved to
    `lib/page-title.ts`); restored as a re-export in `595b012`.
  - Check run on `f92793a..595b012`: no file deleted or renamed, no
    exported `lib` function removed, no server action removed.
  - Not verified in a browser: `ConfirmDialog` after the native-dialog
    change (every confirm in the app uses it) — Phase C must open one.
  - jev_review: escalate (0.54; 13 of 133 files sent, some condensed).
  - Still running: exam guard completion (Opus). Then Phase C.
  - Project done-bar (`web/AGENTS.md`): `npm run typecheck`, `npm test`,
    `npm run test:unit`, `npm run test:integration`. Only typecheck and unit
    have been run. Integration tests write to the shared database (one
    deletes capital rows) — ask the user before running.
- 2026-10-04 ~21:50 — **Exam guard completion merged; all build work is
  in.** `merge/staging-sync` at `b40c47b` (merge of `aeabc93`, `4e2830f`,
  `c4ed594`, `dfe6428`; no conflicts). tsc clean, unit tests 1618/1618,
  eslint: only the known `app/claim/page.tsx:33` error. Whole wave
  `f92793a..b40c47b`: 228 files, no file under `web/supabase` changed, no
  file deleted or renamed. `origin/staging` still `4e6f955` (0 behind,
  169 ahead).
  - Guard now fails closed and refuses an unreadable exam; guards added to
    routine, seat plan, marks, co-curricular, promotion, final-class and
    combination-member actions; marks also allow the teacher named in
    `exam_subject_teachers`; controls hidden/disabled for a refused teacher
    (not on the combinations page). Browser-checked: owner unaffected,
    teacher on her own class works, teacher on another class refused
    including direct action requests.
  - Incomplete state added to the progress report (single + print-all) and
    wired into the student portal.
  - **New finding, filed as #702:** a Student login cannot read
    `grading_schemes` / `grade_bands` (RLS), so the portal shows "no results
    published yet" for everyone and the portal mark sheet 404s. Expected to
    exist on staging too (policies untouched); needs a migration. The portal
    incomplete state is therefore unit-tested only.
  - #676 commented (still open: RLS policy, combinations page controls, rule
    confirmation, ADR).
  - **Phase C launched:** independent evaluation (Opus 5.5, own worktree
    from `b40c47b`, port 3709, branch `worktree-agent-a0c555af76217ebac`).
    It writes `EVALUATION.md` in its scratch directory as it goes; may
    commit small confirmed fixes on its own branch. It does not run
    `npm test` / integration / e2e (shared database).
  - After Phase C: merge any fixes, act on its defects, final issue pass,
    ask the user about running `npm test` and `npm run test:integration`,
    then report merge readiness.
- 2026-10-04 ~22:00 — **New task: student portal overhaul** (user: make the
  student portal look and work like the School Owner UI — information
  heavy, colourful, same theme and grid; shorten the menu; a concise home
  dashboard with pending items by urgency; smoother journeys; plan, then
  execute with multiple agents).
  - Kept OFF the staging merge branch: new branch
    `feat/student-portal-overhaul`, created from `merge/staging-sync`
    `b40c47b`. Same constraints: no migration, no RLS change, no core
    function replaced. #702 (students cannot read grading schemes) stays out
    of scope.
  - Stage 1 running: audit + implementation plan agent (Sonnet 5.5,
    read-only, port 3710). Output:
    `docs/testing/student-portal-audit-2026-10-04/audit.md` and
    `implementation-plan.md` (main checkout). The plan must define 3–4 work
    packages with disjoint file ownership.
  - Stage 2 (after the plan): one implementer agent per work package, each
    in its own worktree from `feat/student-portal-overhaul`, shell/menu
    package first; then merge into that branch, checks, jev review.
- 2026-10-04 ~22:20 — **Student portal plan written** (no code changed):
  `docs/testing/student-portal-audit-2026-10-04/audit.md` (159 lines) and
  `implementation-plan.md` (396 lines). jev_verify: 6/6 key claims verified.
  - Menu: 5 groups — Home | Study (Tasks, Routine, Material, Questions) |
    Exams & Results | Attendance & Leave | Fees & Notices; bottom tabs on
    phone, collapsible sidebar on desktop; Profile in the avatar menu; all
    12 routes keep their URLs.
  - Home: header, "needs you now" alert strip ordered by urgency, four stat
    cards (attendance, fees, homework, latest result), quick actions,
    today's routine, upcoming, latest notices. Result card shows raw marks
    and rank only while #702 is open.
  - Packages: WP-A shell/menu/all i18n strings (first) → WP-B home
    dashboard, WP-C daily pages, WP-D fees/exams/results/profile, with
    disjoint files. Decisions D1–D10 in plan section 6; proceeding on the
    plan's defaults (user has not reviewed them).
  - Audit also found: handed-in homework still counted overdue; attendance
    headline shows 31 absent days (RPC range runs to month end); result
    detail page empty and its print link 404s.
  - Seed limit: the fixture student's class has no routine, exam schedule or
    attendance and no fee due, so several blocks cannot be browser-checked
    with data.
  - **WP-A launched** (Sonnet 5.5, port 3711, branch
    `worktree-agent-a95b3f59974055c83`, from `feat/student-portal-overhaul`
    `b40c47b`). When it reports: merge into `feat/student-portal-overhaul`,
    run checks, then launch WP-B, WP-C, WP-D in parallel.
- 2026-10-04 ~22:45 — **User rule: "include jev for everything"** (saved
  in memory). jev now runs on plan decisions, every package diff (raw diff,
  by me, after each merge), and done-claims.
- 2026-10-04 ~22:50 — **Student portal WP-A merged** into
  `feat/student-portal-overhaul` (worktree `.claude/worktrees/student-portal`,
  `node_modules` and `.env.local` symlinked). Head `2e500d7`:
  - `4641c89` (WP-A): `web/lib/student-nav.ts`, `web/components/student-shell.tsx`,
    `layout.tsx`, 46 new i18n keys (`student.dash.*`, `student.navGroup.*`,
    `student.tab.*`), nav unit tests. Browser-checked by the agent: 12
    routes 200, 5 tabs 56px, owner shell unchanged.
  - `2e500d7` (mine): menu regrouped after `jev_decide` (0.61 for
    "Notices with Home" vs 0.19 for the plan's "Fees & Notices"; jev marked
    the plan's option as hiding a frequently used page). Now: Home (Home,
    Notices) | Study | Exams & Results | Attendance & Leave | Fees.
    Not re-checked in a browser after this commit.
  - tsc clean, unit tests 1627/1627. `jev_review` of WP-A (real code, icon
    constants omitted): escalate, composite 0.74, safe_to_apply 0.35;
    correctness 1.66–1.81, spec 1.81–1.83; limits test gap / blast radius,
    no defect named.
  - Known gap: `student.myRequests` already exists ("আমার অনুরোধ") and was
    not reworded; WP-C uses the existing key.
  - D8 flip later: `contentContainer={false}` → `true` in
    `web/components/student-shell.tsx` once all pages are converted.
  - **WP-B launched** (Opus 5.5, port 3712, branch
    `worktree-agent-ae3cd4e8a5e00ec39`): `web/lib/student/dashboard.ts`
    helpers first, then the home page. WP-C and WP-D start after WP-B is
    merged (they import its helpers).
  - Still running: Phase C evaluation of `merge/staging-sync`.
- 2026-10-04 ~23:10 — **Migration index issue #703 created** (user asked:
  collect every migration recommendation into one issue to implement
  later). 20 database changes in six groups (do-first ops, access, fees,
  exams, attendance, notices/portal, optional), each linked to its issue,
  with a suggested order. Three items have no issue of their own yet:
  per-payment receipts, `off_days` central-holiday source marker,
  question-reply read marker.
  **Completed-issue check** (`jev_verify` 9/9 at `b40c47b`): no further
  issue is complete. Closed so far: #687, #692. Verified still open: #688,
  #691, #693, #694, #696, #698, #699, #700; #676, #678–#681, #683 partly
  done; #677, #689, #690, #695, #697 wait on a decision; #682, #684–#686,
  #701, #702 untouched. Older UI issues (#630, #656, #660, #662) were not
  assessed — they cover the whole owner UI and need the user's judgement.
- 2026-10-04 ~23:30 — **Student portal WP-B merged.**
  `feat/student-portal-overhaul` at `0e25dbd` (`334d781` helpers,
  `7f4f859` home page, `9f7d557` e2e spec written not run, `0e25dbd` my
  one-class fix making `SectionTabs` 44px on phones). tsc clean, unit tests
  1656/1656.
  - `web/lib/student/dashboard.ts` is the helper contract for WP-C/WP-D
    (`isTaskHandled`, `taskUrgency`, `dashboardTaskCounts`, `feeStatus`,
    `examUrgency`, `attendanceBand`, `latestResult`, `rawTotal`,
    `buildStudentAlerts`, `buildStudentUpcoming`, `formatClock`, threshold
    constants).
  - Home, seed student, browser-checked bn/en at 390 and 1440: header,
    Home|Notices tabs, all-clear card, four stat cards (2×2 phone, 4 in a
    row desktop), 5 quick-action chips 44px, routine / upcoming / notices
    cards with worded empty states. Result card "৭২ / ১০০ · মেধাক্রম ১ / ১".
  - NOT seen in a browser (seed has nothing pending): alert strip with rows,
    any toned stat card, routine periods, urgent/unread notices, read-only
    banner, incomplete result. Unit tests only.
  - Deviations: rejected-leave alert window runs from the request date
    (`student_leaves` has no decision timestamp); English count strings have
    no singular ("1 tasks are overdue"); when `contentContainer` flips, the
    home `<main>` must become a fragment.
  - jev (agent, raw diffs): review escalate, composite 0.70, safe 0.36, no
    finding; verify 9 verified, 1 control correctly rejected, 1 contradicted
    at 0.77 ("first screen above the fold" — measurements support the
    claim; treat as review).
  - **WP-C** (Sonnet 5.5, port 3713, `worktree-agent-adbbc3967348d3257`) and
    **WP-D** (Sonnet 5.5, port 3714, `worktree-agent-af66151d704f9d3e7`)
    launched in parallel from `0e25dbd`, disjoint files, read-only in the
    database. After both: merge, flip `contentContainer` (D8) and turn each
    page `<main>` into a fragment, browser re-check, jev on the merged diff.
- 2026-10-04 ~23:45 — **Two more standing rules from the user** (saved in
  memory): (1) every new migration need is added to issue #703 in the same
  step — the body's source copy is `docs/handoff/migration-index-703.md`,
  edit it then `gh issue edit 703 --body-file`; (2) review every step
  myself and give a verdict (accept / accept with conditions / reject)
  above the agent's report and jev's score.
  - #703 updated twice: 4.1 now includes `decided_at` on the leave tables;
    4.4 added (student-readable "attendance was taken for my class"
    source). 21 items.
  - **My review of WP-B (read `web/lib/student/dashboard.ts` in full and the
    home page's attendance/homework wiring): accept with conditions.**
    Logic is sound and pure; boundaries use the Dhaka school day; no grading
    tables read. Conditions / known limits:
    1. A student absent on every marked day this month sees "—" and "school
       has not taken attendance", not 0% — the page treats "no present
       rows" as "no attendance taken" because a student cannot read whether
       the class was marked. Needs #703 item 4.4.
    2. Open homework with no due date, or due more than 2 days out, appears
       nowhere on the home (not counted, and undated tasks are not in
       Upcoming); the card can read "no tasks now" while such tasks exist.
       Fix in code later: count all open tasks in the card value.
    3. English plurals ("1 tasks are overdue").
    4. Low attendance (< 75%) raises an amber alert, while the stat card for
       the same number is red — plan D4 says amber; inconsistent tones.
    5. Alert strip, toned cards and routine periods were never seen in a
       browser (seed has nothing pending).
- 2026-10-05 — **Student portal WP-C merged.**
  `feat/student-portal-overhaul` at `0b28c99` (7 WP-C commits `6dab651` …
  `d239b32`, plus my fix `0b28c99`). tsc clean, unit tests 1664/1664,
  eslint 0 errors. The agent could NOT run jev (its raw-diff call was
  blocked); I ran it.
  - **My verdict: accept with conditions.** Checked myself: the four form
    components changed `className` lines only (diff with className lines
    removed is empty), so no server action or payload changed;
    `web/lib/student/daily.ts` read in full; attendance range now ends
    today for the running month.
  - `jev_gate` (real `daily.ts`, attendance hunks): claims 5/5 verified
    (0.95–0.99): no payload change, month-to-date range, past month to month
    end, handed-in task is done, pending leave first. Review: escalate,
    composite 0.77, correctness 1.79–1.85, limits test gap / blast radius.
  - Defect I found and fixed (`0b28c99`): the page said "school has not
    taken attendance" while the card beside it showed 4 absent days; the
    card now shows a dash in that state.
  - Conditions / open:
    1. Absent count was 4 for 1–4 Oct although 2–3 Oct look like the
       school's weekly off-days (Fri, Sat) and the holiday card said 0 —
       `is_absent_working_day` (migration 0146) may ignore weekly off-days
       for students. NOT verified; needs a look at that function with real
       data. If true it is a database fix → add to #703.
    2. No "Answered" string: the answered group reuses "শিক্ষকের উত্তর".
    3. Populated states never seen in a browser (seed has no leave, no
       waiting question, no routine, no attendance).
    4. On phones the leave and question lists come before the form; quick
       actions jump to `#new-leave` / `#ask`.
  - Still running: WP-D (fees, exams, results…), Phase C.
- 2026-10-05 — **Student portal WP-D merged; all four packages are in.**
  `feat/student-portal-overhaul` at `1e39228` (merge `5bdadef` of
  `7bfef62`, `be750da`, `98da9c4`, `345f138`; then my `1e39228`). Range
  `b40c47b..1e39228`: 39 files; shared files touched: new
  `components/student-shell.tsx`, one class in `components/ui/section-tabs.tsx`,
  47 added lines in `lib/i18n.ts`; nothing under `web/supabase`. tsc clean,
  unit tests 1669/1669, eslint 0 errors.
  - **My verdict on WP-D: accept with conditions.** Read
    `web/lib/student/result-fallback.ts` in full and the mode switch in the
    result detail page: print link is rendered only when a grading scheme
    loaded; raw mode shows marks, total, rank (hidden when a subject is
    missing). File list checked with `git diff --name-only`: exactly the 10
    owned files.
  - `jev_gate`: claims 3/4 verified (0.93–0.99); the "no file outside
    ownership" claim scored 0.43 — I confirmed it myself from git. Review:
    escalate, composite 0.74, correctness 1.5–1.8; limit blast radius.
    The agent's own jev run was on prose summaries for two files — ignore.
  - Conditions: graded result table now prints Bangla digits (only change
    on the graded path); fee due/overdue, exam today/soon, incomplete result
    and material/notification rows never seen in a browser; profile
    correction form controls are 32–42px (file not owned by any package);
    notifications page repeats "বিজ্ঞপ্তি" three times; no `Answered` /
    singular-count strings.
  - My fix `1e39228`: home homework card counts every open task (was only
    overdue + due within 2 days).
  - Left as a decision: low attendance raises an amber alert but a red stat
    card (plan D4 says amber).
  - D8 (`contentContainer` flip) NOT done and not needed: every page owns
    its `<main>` with the shell's gutter classes; flipping would mean
    editing every page for no visible change.
  - **Integrated evaluation launched** (Sonnet 5.5, port 3715, branch
    `worktree-agent-ab83227022304d9d3`): merged portal in a browser, then
    the data states nobody has seen, using `STU-EVAL`-prefixed test records
    it must delete; writes `STUDENT-EVAL.md` in its scratch directory;
    reports migration needs separately (→ #703).
  - Still running: Phase C evaluation of `merge/staging-sync`.
- 2026-10-05 ~06:45 — **Phase C evaluation finished: verdict NOT READY,
  one blocker; blocker now fixed.** Findings file:
  `<scratchpad>/phasec/EVALUATION.md` (scripts, screenshots and fresh login
  states `auth-*.json` are in the same folder; copies used for my re-checks
  are in `<scratchpad>/d1fix/`).
  - **D1 blocker (regression):** dropdowns inside a native `<dialog>` were
    drawn behind it and inert — a class could not be picked in Add Subject.
    **Fixed by me in `1da1e77`**: `NativeDialog` exposes its element through
    context (`useDialogContainer`), and `combobox-field`, `select-field`,
    `dropdown-menu` portal into it with fixed positioning. Re-ran the
    evaluator's reproduction at 1440 and 390: option clicked, `class_id`
    set, popup inside the dialog, Escape with the popup open keeps the
    dialog, page-level combobox unaffected. `jev_gate`: both real claims
    verified (1.0, 0.91); my control claim ("select and menu verified in a
    browser") correctly contradicted — those two are NOT browser-checked.
    Review escalate, composite 0.71, limits test gap / blast radius.
  - **D2:** daily employee table showed "absent" before the joining date.
    **Fixed in `93412bf`** (rows for people not yet joined are left out; a
    real record still shows). Checked: 2020-01-06 → 0 rows, 2026-10-01 → 10.
    Owner only — non-owner roles still cannot read joining dates (#693).
  - `merge/staging-sync` is now at `93412bf`. tsc clean, eslint clean on
    touched files, unit tests 1618/1618. Both fixes merged into
    `feat/student-portal-overhaul` too.
  - Evaluator's requirement table (34 rows): 17 MET, 10 PARTLY, 1 NOT MET
    by decision (AT1 / #677), 6 NOT CHECKED (no suitable data or blocked by
    #702). Duplicate roll (#690) did NOT reproduce: the second student with
    roll 901 was refused in Bangla; constraints exist (0120, 0181).
  - Remaining smaller defects filed as **#704** (Escape closes two layers,
    toasts under dialogs, roster count mismatch, Bangla format leftovers,
    tap targets, titles, test gaps). #686 and #676 commented.
  - **Decisions the user must make before merging:**
    1. Exam guard: a staff user with an employee row but no class (head
       teacher, exam controller) is now refused on every exam that has a
       class; and if `app_class_scope` errors everyone is refused.
    2. English numbers use lakh grouping (`en-IN`) on school and student
       pages while super-admin/agent pages still use `en-GB`/`en-US`.
    3. A school whose only grading scheme has no bands can no longer
       publish any exam until bands are added.
  - Still not run: `npm test`, `npm run test:integration`, e2e (shared
    database) — the project's own done-bar needs them.
  - Left in the database by the evaluator: two `gl_entries` rows (noted on
    #686).
  - Student portal integrated evaluation died at the session limit and was
    resumed (same id); it writes `STUDENT-EVAL.md` in its scratch directory.
- 2026-10-05 ~07:15 — **Disk cleanup** (user asked; Sonnet agent, jev per
  class). 46 GB freed: disk 89% → 63% full.
  - Deleted: main `web/.next` (36G build cache), `web/tsconfig.tsbuildinfo`,
    `web/test-results`; **41 finished worktrees removed with
    `git worktree remove`** (no `--force`; all branches kept).
  - **Paths in this file under `.claude/worktrees/agent-*` are now gone**
    except: `agent-ab83227022304d9d3` (student evaluator, live),
    `agent-a05da8fc902e2afa4` (untracked migration file
    `0051_transfer_student_drop_stale_overload.sql`), `agent-a725aae3f60ca2661`
    (untracked `screenshots/`), `agent-a8293cee75ad9a424` (copy of the
    student audit docs — identical to the main checkout's),
    `agent-a6ef9ff6f3142cce8` (3 commits in neither target branch, a process
    running). Kept: `staging-sync`, `student-portal`.
  - The old login states under `agent-ae148a78d57cc03b6/web/e2e/.auth/` are
    gone (they had expired). Fresh ones: `<scratchpad>/phasec/auth-*.json`.
  - Checked by me afterwards: main checkout still 128 changed/untracked
    entries, key branches resolve, ports 3700 and 3716 answer 200.
  - Not touched (owner's call): `~/.npm` 512M, `~/.cache` 3.4G,
    `.next` in the four kept worktrees (~1.1G), untracked images/docs.
- 2026-10-05 ~07:10 — Dev server for the student branch:
  `npx next dev --webpack --port 3716` from
  `.claude/worktrees/student-portal/web`. The user first looked at port 3700
  (old student UI, `merge/staging-sync`) and saw no change; the redesign is
  only on `feat/student-portal-overhaul`. Asked whether to merge it into
  `merge/staging-sync` — no answer yet. Student login:
  `s9001@test-a.students.invalid` (password in `web/supabase/seed-test.sql`).
- 2026-10-05 ~07:40 — **Student portal integrated evaluation finished:
  "ready with listed conditions". My verdict: same.** Notes:
  `<scratchpad>/STUDENT-EVAL.md`, screenshots in `<scratchpad>/shots/`.
  - Observed with real data (`STU-EVAL` records, all removed): alert strip
    order and colours, homework piles, hand-in moves a task to Done, urgent
    and new notices, pending and rejected leave, waiting question, tick/undo,
    leave and question forms submit. All 17 routes 200 at both widths and
    languages; keyboard, dark mode, print dialog fine. Unit tests 1669/1669.
  - **Defect 1 (database, pre-existing): weekly off-days are counted as
    absences.** I confirmed it in code: `is_absent_working_day` (migration
    0046) checks `off_days`, approved leave and present records only;
    `schools.weekly_off_days` came later (0206) and the function was never
    updated. A student present 2 of 3 working days showed 40%, not 67%, with
    a false "attendance low" alert. The absence fine and absence SMS use the
    same function. **Added to #703 as item 4.0, first in the suggested
    order.** Not fixable without a migration.
  - Defect 2: home homework card (all open tasks) vs chip and tab (overdue
    + due soon) showed 5 vs 3. **Fixed in `99d19a8`**: the chip no longer
    carries a count. The Study tab badge still shows the urgent count.
  - Not checked: routine with periods, fee due/overdue, result print, admit
    card, leave-rejected colour.
  - Minor, not fixed: homework in "আসন্ন" tagged "ক্লাস" (plan D3);
    handed-in task still shows the "mark done" button; "Seed Class - A" vs
    "Seed Class / A"; bogus admit-card URL is a soft 404; breadcrumb and
    profile-correction controls under 44px; "Open menu" in English.
  - **User request (screenshot): student shell brand must show the school
    name like the owner portal. Done in `99d19a8`**: layout reads
    `schools.name` (students may read their own school, policy 0133) and
    passes it to `StudentShell`; subtitle stays "শিক্ষার্থী পোর্টাল".
    Browser-checked on port 3716: "T | Test School A | শিক্ষার্থী পোর্টাল".
  - `feat/student-portal-overhaul` at `99d19a8`. tsc clean, eslint clean.
- 2026-10-05 ~08:30 — **Animation pass 1 (user asked: pulse, colour-
  changing progress bars, more engaging UI for both portals).** Done by me
  in the shared widgets:
  - `merge/staging-sync` at `dd36263`: `web/app/globals.css` (`ui-rise`,
    `ui-bar`, `.ui-stagger`, `.ui-bar`); `web/components/ui/widgets.tsx`
    (`ToneDot` with ping, `ProgressBar` with tone + role=progressbar +
    grow-in, `StatCard progress`, staggered `StatGrid` / `AlertStrip`,
    pulsing dot on alert-tone cards and rows, press feedback on chips);
    owner bottom tabs press feedback; owner attendance-today card bar.
  - `feat/student-portal-overhaul` at `14615d0` (merged `dd36263`):
    student attendance and result cards with bars, student bottom tabs.
  - Browser-checked both dashboards at 1440 and 390: stagger and ping run;
    under reduced motion the durations are ~0 and ping is `none`; no
    console errors, no overflow. tsc clean; unit tests 1618 / 1669.
  - **Animation pass 2 launched** (Sonnet 5.5, port 3717, branch
    `worktree-agent-a8fc444dd872267a6`, from `feat/student-portal-overhaul`
    `14615d0`): more bars where a ratio is shown, band colours, pulse on
    urgent states, interaction feedback, list-page entrance, optional
    count-up. CSS only, no dependency. NOTE: its owner-portal changes land
    on the student branch, which is now a superset of `merge/staging-sync`.
- 2026-10-05 ~08:35 — **Repo cleanup outside `web/` launched** (user: "web
  is the main source now; evaluate all others and delete what is not
  relevant and not dependent on web"). Sonnet 5.5, works in the MAIN
  checkout (no worktree). Rules: never touch `web/`, `.git`, `.claude/`,
  `.agents/`, `.mcp.json`, `CONTEXT.md`, `README.md`, `docs/adr`,
  `docs/handoff`, `docs/testing`, `Design System/`; jev_verify per
  candidate; **tracked files removed from the working tree only (no
  commit, restore with `git checkout -- <path>`); untracked files moved to
  `~/.Trash/Amar_school_LMS-cleanup-2026-10-05/`**. Report:
  `docs/handoff/repo-cleanup-2026-10-05.md`.
- 2026-10-05 ~09:00 — **Repo cleanup outside `web/` finished. My verdict:
  accept.** Report: `docs/handoff/repo-cleanup-2026-10-05.md`. ~21.7 MB.
  - Removed from the working tree, uncommitted (restore:
    `git checkout -- dashboard-desktop.png docs.code-workspace figma handsoff`):
    stray screenshot, stale VS Code workspace, `figma/` (6 old SVG mockups),
    `handsoff/` (2 July handoff logs). jev 0.91–0.96 each.
  - Moved to `~/.Trash/Amar_school_LMS-cleanup-2026-10-05/`: `s-home.png`,
    root `node_modules/` (only a `.vite` cache), `.playwright-mcp/` (21M).
  - **Kept, and I confirmed why:** `index.html`, `.nojekyll`, `ui/` are a
    LIVE GitHub Pages site (`gh api .../pages` → branch `main`, path `/`,
    https://salmansrizon.github.io/Amar_school_LMS/); 44 lines in `web/`
    cite `ui/...` prototype files. `graphify-out/` is used by the /graphify
    skill. `home.yml`, `routes.txt` (legacy captures, jev 0.75) kept — ask.
  - Checked by me: only new ` D` lines are those 10 paths; ` D web/app/icon.svg`
    is the user's own earlier change (replaced by `icon.png`), not the
    agent's. tsc passes; ports 3700 and 3716 answer.
- 2026-10-05 ~09:05 — **User: student fee cards do not match the owner's
  cards.** Cause: bare `StatCard`s with no icon art. Fixed in `d138954`
  (`feat/student-portal-overhaul`): icons on the fee, attendance and result
  cards, a paid-vs-payable bar, a marks bar. Screenshot checked.
- 2026-10-05 ~09:10 — **Docs revamp launched** (user: "revamp docs with
  only relevant files"). New branch `docs/revamp` from `merge/staging-sync`
  `dd36263`; Sonnet 5.5 agent in its own worktree
  (`worktree-agent-aaab04107d5d1e89f`). Rules: files referenced from `web/`
  keep their exact path; ADRs untouched; nothing deleted except junk —
  superseded docs go to `docs/archive/` with `git mv`; untracked docs from
  the main checkout (this handoff, audits, migration index) are COPIED in
  so they get versioned; new `docs/README.md` index; mechanical reference
  check before/after; jev per decision. The main checkout's docs are not
  touched.
- 2026-10-05 ~09:40 — **User (screenshot): student questions page — form
  on top, questions as a table, click a row for a question/answer
  timeline.** Done by me in `47e6191` (`feat/student-portal-overhaul`),
  one file `web/app/student/questions/page.tsx`: ask form first; one table
  (subject, about, date, status with a tone dot); a row link opens
  `?q=<id>#q` and the page renders that question's timeline above the table
  (asked + time, then the reply + time, or a pulsing "awaiting reply"
  step); "বন্ধ করুন" returns to the plain list. No new strings, no query or
  action change, `ask-form.tsx` untouched, `#ask` anchor kept (e2e and home
  quick action rely on it). Browser-checked at 1280 and 390 (9 rows, 2
  timeline steps, no overflow, 0 errors); tsc clean; unit 1669/1669.
  `jev_verify` 5/5 verified (0.99–1.0). The data model is one question,
  one reply — the timeline has at most two steps until threads exist.
  NOTE: the animation pass 2 agent may also touch this page's neighbours;
  expect a small merge.
- If the session dies: find the implementer branches with
  `git branch --list 'worktree-agent-*' --sort=-committerdate | head` and
  `git log merge/staging-sync..<branch> --oneline`; merge finished ones into
  `merge/staging-sync` one at a time (expect `web/lib/i18n.ts` conflicts —
  both sides add keys; keep both), re-run tsc / eslint / `vitest tests/unit`.
- Still to do after Phase A: merge the four branches; Phase B cross-cutting
  sweep; Phase C independent evaluation with jev; report to the user.
