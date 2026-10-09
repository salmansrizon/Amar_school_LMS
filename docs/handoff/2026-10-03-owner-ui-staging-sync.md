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
- 2026-10-05 ~10:20 — **Animation pass 2 merged. Verdict: accept with one
  correction (done).** `feat/student-portal-overhaul` at `de4c4b0`.
  - Agent added: paid/collected bars (student and owner fees), marks
    progress bar (owner exams), pulses on overdue pile, first past-due fee
    row, exam today, unmarked classes; press feedback on toggles; entrance
    on list pages. Count-up skipped. Its jev run used condensed diffs
    (escalate 0.56) — low value.
  - **My correction:** pass 1 made every alert-tone `StatCard` ping. Several
    owner cards use red as a category (expenses, failed SMS, total due even
    at 0), so they pinged forever. `StatCard` now has an opt-in `pulse`
    prop; set only for student attendance low / fee overdue / homework
    overdue and owner attendance under 85%.
  - Browser-checked on port 3716: owner `/school`, fees, exams; student
    home, tasks, fees, exams, results, notices — stagger and bars present,
    no stray pings, no overflow, 0 console errors. tsc clean; unit
    1669/1669. Student pulses not seen with data (seed has nothing urgent).
  - NOTE: owner-portal animation changes of pass 2 exist only on the
    student branch (a superset of `merge/staging-sync`).
- 2026-10-05 ~10:25 — **Docs revamp finished. Verdict: accept.** Branch
  `docs/revamp` now at `e283463` (7 commits). I checked the diff myself:
  28 files added, 2 moved (`R100`, the two old handoffs into
  `docs/archive/handoff/`), nothing else changed, nothing under `web/`.
  New `docs/README.md` index, `docs/adr/README.md`, `docs/archive/README.md`,
  `docs/_revamp/inventory.md` (91 files classified). Untracked docs from
  the main checkout were copied in (byte-identical) and are now versioned
  there — including a SNAPSHOT of this handoff; the working copy in the main
  checkout keeps growing. Nothing dropped: almost every doc is cited from
  code. Undecided, left in place: `ux-audit.md`, `ux-journey-map.md`
  (jev 0.56 on "superseded"), `010_exam_system.md`. Not merged anywhere yet.
- 2026-10-05 ~10:30 — **Two more student-portal agents launched** (both
  Sonnet 5.5, own worktrees from `de4c4b0`):
  - Questions upgrade (port 3718, `worktree-agent-aeccac31102cb6754`):
    Markdown editor with toolbar (code block, text size, lists, preview)
    over a real textarea using the installed `react-markdown` + `remark-gfm`
    (no raw HTML, no images); `DataTable` for the list; conversation popup
    with follow-ups. Follow-ups are grouped BY CONVENTION (same anchor +
    same title) because there is no thread column — **#703 item 5.4 added**
    (`student_messages.parent_id`).
  - Student lists as owner-style tables (port 3719,
    `worktree-agent-abed1716b510d7fd6`): tasks, notices, leave, results,
    exams, fees, materials → shared `DataTable` with search, filters,
    pagination and the keyboard-shortcut bar. Must not edit
    `components/data-table/` or the questions page.
  - Expect conflicts between the two only in `web/lib/i18n.ts`.
- 2026-10-05 ~11:15 — **Questions upgrade merged. Verdict: accept with
  conditions.** `feat/student-portal-overhaul` at `a3a0108` (fast-forward:
  `843edf1`, `a3a0108`). tsc clean, eslint clean, unit tests 1687/1687.
  - Built: `web/components/rich-text-field.tsx` (toolbar over a real
    textarea, Markdown, Write/Preview), `web/lib/rich-text.ts` (pure
    transforms), `web/components/markdown.tsx` (renderer),
    `web/lib/student/question-threads.ts` (conversations by convention),
    `app/student/questions/{page,question-dialog,follow-up-form}.tsx`,
    `DataTable` list (search param is `?find=`; `?view=` and old `?q=` open
    the popup); teacher drawer and reply display render Markdown.
  - **I read the renderer myself**: no `rehype-raw`, no
    `dangerouslySetInnerHTML`, link allowlist http/https/mailto with
    `rel="noopener noreferrer nofollow"`, images become their alt text.
    My browser check at 1280 and 390 on the conversation holding the
    agent's payloads: 0 `<script>`, 0 `<img>`, 0 `onerror`, 0 `javascript:`
    links, no alert fired; popup opens, 4 timeline steps, composer present,
    Escape closes (slow on the dev server), no overflow, 0 console errors.
  - Conditions: teacher's reply input is still a one-line field; the
    teacher's list preview shows raw Markdown; toolbar edits are not in the
    undo stack; Bangla at 390 and the page-size control were not exercised;
    the popup needs JS (content is server-rendered but hidden until
    hydration); follow-ups are separate rows for the teacher (#703 5.4).
  - 18 new strings under `student.editor.*`, `student.followUp`,
    `student.messagesCount`, `student.lastActivity`,
    `student.questionsSearch` — owner to review wording.
  - **#703 updated**: 5.5 body length limit, 5.6 several replies, 5.7
    attachments, 5.8 student delete of own unanswered question (27 items).
  - Left in the database: 4 `STU-Q-EVAL…` question rows for S9001 and their
    teacher notifications (no delete in the app). The agent's attempt to
    delete them with the student's token was blocked; I did not do it
    either. Noted on #686.
  - Still running: student lists as tables; demo data seeding (manifest
    `docs/handoff/student-demo-data-2026-10-05.md`).
- 2026-10-05 ~12:00 — **Student lists as tables merged. Verdict: accept
  with conditions.** `feat/student-portal-overhaul` at `efd88d4` (7 commits
  `da3116a` … `f9a694d`). tsc clean, eslint 0 errors, unit 1691/1691.
  Nothing under `components/data-table/` changed (checked).
  - Converted to the owner's `DataTable` (search `q`, filters, `page` /
    `size`, shortcut bar `/` and `F` on desktop): tasks (state filter,
    default open tasks; `?state=all` for everything), notices, leave,
    results, exams (per paper), fees, materials. Notifications not
    converted (shared `NotificationInbox` draws its own list). New
    `web/lib/student/table.ts`, `web/components/student/no-match.tsx`.
  - My browser check, Bangla, 1440 and 390, all 8 list pages incl.
    questions: 200, search present where rows exist, no overflow, 0 console
    errors.
  - Conditions: **on a phone each task is now a ~180px card (about two per
    screen); the old rows were ~50px** — tasks and notices are worse on
    phones as tables (agent's judgement, screenshot
    `<scratchpad>/tbl/shots/390-en-_student_tasks.png`); exams table never
    seen with rows; search box and filter selects are 42px (inside
    `DataTable`); Tasks default filter reads "All Open tasks"; 23 new
    `student.col.*` strings; two e2e assertions updated, not run; the
    agent's jev run covered helpers only (escalate 0.70), pages unreviewed.
  - #703: 5.9 added (subject on homework and study material — no subject
    filter possible today). 28 items.
- 2026-10-05 ~12:05 — **Demo data: only 2 of 10 items created.** Manifest
  `docs/handoff/student-demo-data-2026-10-05.md`. Created: pending leave
  "DEMO পারিবারিক অনুষ্ঠান" (12–13 Oct, removable with withdraw) and
  question "DEMO ভগ্নাংশ যোগ" (database-only removal). **Blocker: the seed
  student's class "Seed Class - A" belongs to academic year 2026; Test
  School A's started years are 2030–2032, so owner and teacher pages
  (class pickers, attendance roster, student list, fee form) cannot reach
  the class or the student.** Homework/notices could only be posted
  school-wide, which the agent's rules forbade. No SMS, no money, nothing
  existing edited. Options put to the user: allow school-wide DEMO
  notices/homework in Test School A; or seed via the database (needs
  access); or use a student in an active-year class instead.
- 2026-10-05 ~12:30 — User feedback handled:
  - "Timeline not aligned" (dot off the line): fixed in `f169c80`
    (`-left-[26px]`); measured line centre = dot centres at 1280 and 390.
  - "File attachment, max 1 MB overall": needs a table + storage bucket.
    **User decision: record in #703, build later.** #703 item 5.7 now
    carries the 1 MB-total rule. No attach button in the editor for now.
  - **User decision on demo data: post DEMO homework and notices
    school-wide in Test School A.** Demo agent resumed with that one rule
    lifted (5 homework, 3 notices, one hand-in). Routine, exam schedule,
    attendance, fee and materials stay skipped (class is in year 2026,
    owner pages only reach 2030–2032).
  - `feat/student-portal-overhaul` at `f169c80`.
- 2026-10-05 ~12:45 — **Rich-text scope agent launched** (user: "find the
  scope for rich text and add them"). Sonnet 5.5, port 3720, branch
  `worktree-agent-aff0cd479940c4ccc`, from `feat/student-portal-overhaul`
  `f169c80`. It lists every long free-text field in both portals, traces
  each one's consumers (screens, print layouts, SMS, notifications,
  exports), classifies ADD / DISPLAY-ONLY / NO, verifies each ADD with jev,
  then swaps in `RichTextField` and renders with `Markdown` at every
  display site; adds `markdownToPlainText` for previews and notifications;
  formal-tone toolbar labels for the owner portal. No server action,
  validation, migration or RLS change. Scope file:
  `docs/handoff/rich-text-scope-2026-10-05.md`. Fields that feed SMS, print
  or ledgers must stay plain.
- 2026-10-05 ~13:00 — **Demo data stopped: no school-wide records were
  created.** The agent's create step was denied by the permission system
  ("Modify Shared Resources") and it stopped. I did not perform the action
  for it. The user must approve that write in the permission prompt (or
  create the records by hand) if they still want it. Database still holds
  only the DEMO leave and DEMO question.
  - **Finding (real product gap, filed as an issue):** homework has no due
    date anywhere in the owner/teacher portal. `publications.due_at` is
    only read (`my-classes`), never written; the create form and
    `createPublication` have no such field. So in real use every homework
    is "later": the student portal's overdue / due-soon piles and the home
    alerts for homework can never fire. Code-only fix (column exists) but
    it changes a server action. The earlier `STU-TBL` tasks that showed due
    dates were inserted by the tables agent outside the app's forms.
- 2026-10-05 ~13:30 — **Demo data, second pass (done by me, on the user's
  direct approval of school-wide posts in Test School A).** Created through
  `/school/notices/new` as owner: 5 DEMO homework (no due dates — #705) and
  3 DEMO notices (one urgent). Visible to every student of Test School A
  until deleted from `/school/notices`. No SMS path in that action. Manifest
  updated: `docs/handoff/student-demo-data-2026-10-05.md` (also holds the
  coverage table).
  - **Coverage check (user: "check all features have enough demo data").
    Answer: no.** Browser as S9001: home alert strip 3 rows (urgent notice,
    pending leave, 2 new notices); tasks 6, notices 5, leave 1, questions
    12, results 1, fees 1 (paid). **No data: exams, routine, attendance,
    materials, notifications. No state possible: homework overdue / due
    soon (#705), fee due / overdue, exam today, attendance bands,
    incomplete result.**
  - `jev_verify`: "every feature has enough demo data" contradicted (1.0);
    "fees testable in due/overdue" contradicted (0.99); home alerts and
    tasks claims verified (0.91, 0.92). It marked "exams/routine/… have no
    data" contradicted at 0.54 — a misread; the browser output shows 0 rows
    on each, I keep my reading.
  - Root cause of the gaps: the seed student's class is in academic year
    2026; owner pages reach only 2030–2032. Full coverage needs either a
    DEMO student in an active-year class (new student + login) or seeding
    through the database.
- 2026-10-05 ~14:15 — **Rich-text scope: done. Verdict: accept.** Scope
  table: `docs/handoff/rich-text-scope-2026-10-05.md` (copied from the
  agent's worktree). `feat/student-portal-overhaul` now has:
  - Agent (`ce0a3d5`, `748fbf3`): teacher's reply to a question →
    `RichTextField` with formal labels (new `formal` prop, keys
    `editor.write`, `editor.hint`, `questions.replyLabel`);
    `markdownToPlainText` in `web/lib/rich-text.ts`; teacher list preview
    uses it. jev_verify on that field 0.99.
  - **Me (latest commit "feat(ui): rich text for the notice and homework
    body"):** the agent held this field back because jev scored its
    "no SMS/print/export consumer" claim 0.74–0.75. I traced every reader
    of `publications.content` myself — owner notice detail, student notice
    detail, student task detail, materials 2-line preview, edit form; no
    SMS, print, export or notification — and converted it: editor in
    `notices/new/create-form.tsx` (new `defaultValue` prop so the edit page
    loads stored text), `Markdown` at the three detail sites, plain-text
    strip on the materials preview.
  - Browser-checked: owner form shows 10 toolbar buttons and the formal
    hint; a formatted notice saved; student view at 390px shows heading,
    list, code block, bold and a safe link; the three attack strings were
    inert (0 script, 0 img, 0 onerror, 0 javascript: links, no alert); an
    old plain notice keeps its paragraphs; the edit form loads the stored
    Markdown and saves. tsc clean, eslint clean, unit tests 1696/1696.
  - Classified NO (stay plain): leave reason (search key, table cells),
    behaviour note (goes into an SMS), SMS text, feedback reply (emailed as
    plain text), transfer note, admission sibling info (printed), machine
    setup text. Super-admin pages out of scope.
  - Known side effect: an OLD notice or reply line beginning with `- `,
    `1. ` or `# ` now renders as a list or heading.
  - Demo record 9 added (formatted notice, school-wide) — in the manifest.
  - The agent removed its own `RT-EVAL` test questions using the
    super-admin fixture.
- 2026-10-05 ~15:00 — **User: "Merge the student branch into
  merge/staging-sync". Done** — fast-forward (staging-sync was 0 ahead, 43
  behind). `merge/staging-sync` and `feat/student-portal-overhaul` now point
  at the same commit; from here work lands on `merge/staging-sync` and the
  student branch is fast-forwarded after it.
  - After the merge: `origin/staging` still `4e6f955`, 0 behind / 215+
    ahead; only migration file differing from staging is still 0214; tsc
    clean; unit tests 1696/1696; no exported `lib` function and no file
    removed since `f92793a` (270 files changed in the whole wave); eslint
    errors only in `app/claim/page.tsx:33` and `e2e/fixtures/roles.ts`
    (both older than this work).
  - Smoke on port 3700 as owner (12 pages) and student (12 pages), Bangla:
    all 200, none redirected to login, 0 console errors.
  - Port 3700 now serves the redesigned student portal too; port 3716
    (student worktree) is redundant.
- 2026-10-05 ~15:20 — **User (screenshot): make the student attendance
  calendar professional, like Google Calendar.** Done in `a648b20`
  (`web/app/student/attendance/page.tsx` only): reuses the owner's
  `MonthGridFrame` — bordered cells, weekday header, tinted weekend columns,
  date top-left, today in a filled circle, state chip per day (dot on
  phones, state in the `aria-label`), future days dimmed. Reads
  `schools.weekly_off_days` (a student may read their own school row) to
  mark weekly off-days; the off-day stat card counts the same cells (10 in
  October for Fri+Sat). The absent count still comes from the database
  function (#703 item 4.0 unchanged). Browser-checked at 1280 and 390: 31
  cells, today = ৫ অক্টো ২০২৬, no overflow, 0 errors. Both branches at
  `a648b20`.
- 2026-10-05 ~15:50 — **User: "make all calendars like this Google
  calendar". Done in `1db79d4`** (both branches). Shared pieces added to
  `web/app/school/attendance/calendar-shell.tsx`: `CAL_CELL`, `CAL_WEEKEND`,
  `CAL_OUTSIDE`, `CAL_CHIP`, `CalendarDayNumber`. Used by all four month
  calendars: Employee Attendance Calendar, Off-Day / Leave Calendar, one
  employee's own calendar (was a colour-filled cell; now white cell + chip
  + phone dot + `aria-current`), student attendance calendar (now also
  shows neighbouring-month days muted). The year grid of mini months on the
  Off-Day page is unchanged (a different view).
  Browser, Bangla, owner + student, 1280 and 390: each calendar 35 cells,
  one cell height (112px desktop, 64px phone), today circle present, no
  overflow, 0 console errors. `jev_verify`: today circle 0.94, no overflow
  1.0, one height 0.77 (review — the measurements show a single height per
  width), control claim "data loading changed" correctly contradicted 0.98.
  tsc clean, eslint clean, unit 1696/1696. e2e spec
  `school.attendance-calendars.spec.ts` uses `data-iso` selectors, which
  were not touched; not run.
- 2026-10-05 ~16:40 — **State check + grilling + plan (user: "verify the
  unfinished job and recommendation and create a plan to execute").**
  Plan file: `docs/handoff/plan-2026-10-05-finish-and-merge.md` (read it
  first in a new session). `jev_verify` on the state: nothing pushed (0.90);
  docs revamp not merged then (0.98); only 2 of 4 done-bar commands run
  (1.0); 28 issues open (1.0).
  **Decisions from the grilling:** (1) database-writing test suites are NOT
  run here — the pipeline / other developer runs them; (2) exam guard stays
  as ADR 0021 (an employee with no class cannot change an exam that has a
  class); (3) English keeps lakh grouping; (4) build the homework due date
  (#705) now; (5) student tasks and notices: compact rows on phones, table
  from 640px; (6) the user deleted `ui/` on purpose — prototype site
  retired; (7) ONE pull request: docs revamp and repo cleanup go into
  `merge/staging-sync`; (8) create a DEMO student in an active-year class.
  User said **Go**.
- 2026-10-05 ~16:50 — **Phase 1 launched** (three agents, own worktrees
  from `1db79d4`):
  - 1A homework due date #705 (Opus 5.5, port 3721,
    `worktree-agent-a160b0cd30eeffbc2`) — owns `app/school/notices/**`,
    `app/school/my-classes/**`.
  - 1B compact phone rows for student tasks + notices (Sonnet 5.5, port
    3722, `worktree-agent-a25ed3758333b9b0d`).
  - 1C small #704 defects: toasts above dialogs, one Escape per layer,
    select/menu in dialog check, Bangla format leftovers, Bangla digits in
    the marks grid, tap targets, page titles (Sonnet 5.5, port 3723,
    `worktree-agent-a626a2cf526a68acf`).
- 2026-10-05 ~17:10 — **Phase 2 done by me** on `merge/staging-sync`:
  - merged `docs/revamp` (30 files, no conflicts);
  - `8c2580c` docs: current handoff, migration index, plan, demo manifest;
  - `11f53ab` removed `ui/` (147 files), root `index.html`, `.nojekyll`,
    `figma/`, `handsoff/`, `dashboard-desktop.png`, `docs.code-workspace`;
    `docs/README.md` notes the retired prototype. Checked before removing:
    nothing in `web/` reads those paths (only 46 code comments and ADR 0006
    name `ui/…` files); tsc clean, unit 1696/1696 after.
  - `merge/staging-sync` at `11f53ab`: 0 behind / 227 ahead of
    `origin/staging`. `feat/student-portal-overhaul` is now BEHIND it (still
    `1db79d4`) and no longer needed; work continues on `merge/staging-sync`.
  - The handoff copy inside the branch is a snapshot from 17:05; the working
    copy in the main checkout is the live one — re-copy it before the PR.
  - Kept at the repo root: `graphify-out/`, `home.yml`, `routes.txt`,
    `Design System/` (user is reorganising it).
- 2026-10-05 ~17:40 — **Phase 1B merged (compact phone rows). Verdict:
  accept with one condition.** `merge/staging-sync` now includes `e732dc9`,
  `26e321a`. tsc clean, unit 1696/1696.
  - Below 640px tasks and notices are one-line rows (56–57px, was ~180px;
    5 tasks on the first screen); from 640px the `DataTable`. Both render
    from the same paged rows. Search 44px, filters 44px (were 42), pager
    44px, toggle 44px. Only one layout is in the accessibility tree.
    `components/data-table/` untouched.
  - New `web/components/student/phone-rows.tsx`. **Condition (brittle):**
    it hides `DataTable`'s own phone cards and reorders its parts with CSS
    selectors on a wrapper (`ul.divide-y:not([aria-label])`,
    `div.overflow-x-auto`). If `DataTable`'s markup changes, this breaks
    silently. Proper fix later: a `renderPhoneRows` prop on `DataTable`.
  - I looked at the 390px screenshot: rows, rails and dates read well. The
    Bangla done-toggle label ("শেষ হয়েছে চিহ্নিত করো") takes ~140px and
    squeezes the title — candidate for an icon-only toggle on phones.
  - "All open tasks" label fixed; unused `student.col.action` removed.
  - jev (agent, abbreviated diffs): review escalate 0.62; verify 4 verified,
    1 review ("desktop unchanged" — the 640–767px range changed on purpose).
- 2026-10-05 ~18:10 — **Phase 1A merged (homework due date, #705).
  Verdict: accept.** `merge/staging-sync` at `c61a009` (agent commits
  `2400f3d`, `999a6a6`, `f183e92`, `b84cb26`). tsc clean, eslint 0 errors,
  unit tests 1709/1709. No migration (still only 0214 differs from staging).
  - I read the store logic: `dueDateToTimestamp` / `publicationDueAt` in
    `web/lib/publishing.ts` — a date is stored as end of that day in Dhaka
    (`T23:59:59+06:00`); empty → null; malformed or > 2 years ahead →
    the action's normal `{ error }`; a past date is allowed; any non-homework
    kind stores null; `dueDate` undefined leaves the column out of the write,
    so existing callers store what they stored before.
  - Form: optional date + clear button, homework type only; edit page
    prefills. Shown on the owner list, detail, drawer and the teacher's class
    list (which selected `due_at` but never rendered it before).
  - Agent's browser check with five `DUE-EVAL` tasks (all removed): student
    home showed the red overdue row first, then the amber due-soon row;
    tasks page states matched; moving and clearing a date as owner changed
    the student view. `jev_verify` 4/4 (0.89–1.0); `jev_review` escalate
    0.64 (correctness 1.37–1.93; limits blast radius / test gap).
  - Side effects: the notice form no longer overflows its card at 390px
    (it did before, for every type); a non-homework row that somehow had a
    due date loses it when edited through the form.
  - 5 new strings `notices.dueDate*` for wording review.
  - #705 can be closed once Phase 4 confirms.
- 2026-10-05 ~18:15 — **Phase 3 launched**: DEMO student + data agent
  (Sonnet 5.5, no worktree, uses the dev server on port 3700, browser session
  only). Told to stop a step, not work around it, if the permission system
  refuses. Manifest heading "Fourth pass — DEMO student". Still running: 1C.
- 2026-10-05 ~19:00 — **Phase 1C merged (small #704 defects). Verdict:
  accept with conditions. Phase 1 is complete.** Agent commits `166d1d5`,
  `3b398ec`, `12b78e3`, `e07656b`, `7b971dd`, `e7a822f`; plus my
  "row view links are 44px high on phones". tsc clean, eslint 0 errors,
  unit tests 1711/1711.
  - Fixed: (1) toasts stay visible and clickable while a dialog is open —
    `NativeDialog` mounts its own sonner `<Toaster>` and `globals.css` hides
    the body one while a dialog is open; (2) one Escape closes one layer
    (`stopPropagation` on Escape in `NativeDialog`) — exam Basic Info →
    Delete → Escape now keeps the form and the typed text; (4) Bangla dates
    and digits on leave pages, exam list/drawer/routine, result book,
    promotion, mark form, off-day heading; (5) Bangla digits accepted in the
    marks grid (input is now `type="text" inputMode="decimal"`; rules still
    enforced by `markCellError`; stored values unchanged; e2e
    `uat-pass3-exam.mjs` selectors updated); (6) Approve / Reject and exam
    controls 44px on phones; (7) titles on dashboard, exam setup, off-day
    calendar; search input labelled.
  - I read `native-dialog.tsx` after the change and re-ran my own browser
    checks on port 3700: dropdown inside the Add Subject dialog still works
    at 1440 and 390 (option picked, Escape on the popup keeps the dialog);
    student question popup opens at 1280 and 390 with 0 errors.
  - Conditions / handed back: no real `SelectField` or `DropdownMenu` lives
    inside a dialog today (checked only on a throwaway page); exam routine
    times still `09:00 - 11:00` (12-hour format is a decision); receipt
    amount in words is English only (a Bangla converter is a feature);
    filter comboboxes 42px (shared); toast timer restarts when it moves into
    a dialog; Safari/Firefox not checked; the dev log printed a fixture
    password once (test account).
  - jev (agent, condensed diffs): review escalate 0.44 — `native-dialog`
    correctness 1.36 at confidence 0.04; verify 5/5 (0.86–1.0).
  - Waiting: Phase 3 (DEMO student). Then Phase 4 evaluation.
- 2026-10-05 ~20:00 — **Phase 3 done: DEMO student with data. Verdict:
  accept.** Nothing was refused by the permission system. Manifest heading
  "Fourth pass — DEMO student" in
  `docs/handoff/student-demo-data-2026-10-05.md`.
  - Student `DEMO শিক্ষার্থী রাফি`, roll 88, S9292, class
    `UXA-Att 1790996221552 - A` (2032). Login
    `s9292@sch3d5b6aaf.students.invalid`; password in
    `<scratchpad>/demo2/cred.txt` (owner can reset it on the student's
    profile page).
  - Created: 5 dated homework + 2 notices (class only), routine Mon/Tue
    (published), exam `DEMO মডেল টেস্ট` with 3 papers, attendance 5 Oct
    present / 4 Oct absent, fee ৳500 due ৳0 received, 2 materials; as the
    student: pending leave, a question, one task ticked.
  - Home as that student shows 6 alert rows: overdue homework, urgent
    notice, fee due ৳৫০০, 2 due soon, attendance low ২০%, exam soon. Stat
    cards: attendance ২০% red, fees ৳৫০০ amber, homework ৯ red, result "—".
  - Attendance reads present 1, absent 4 (marked: 1 present, 1 absent; the
    other 2 are Fri/Sat off-days — #703 item 4.0), and that alone fires the
    "attendance low" alert.
  - Side effects: saving attendance wrote default "present" rows for the 12
    other `UXA-Att` test students on 4 and 5 Oct; the exam uses the only
    grading scheme, which has no bands, so its results can never be
    published; routine slots cannot carry a DEMO prefix.
  - Observed by the agent, not yet triaged: the OWNER fee list labels the
    ৳0-received record "আদায় হয়েছে" although ৳500 is due (Phase 4 item J).
- 2026-10-05 ~20:20 — **Security defect found and fixed by me (`8d903dd`),
  filed as #706.** The login form had only `onSubmit` and no `method`; a
  submit before hydration did a native GET and put the email and password
  in the URL. It is on `staging` too. Fix: login `method="post"` + the
  button disabled until the handler exists (`useSyncExternalStore`);
  `method="post"` on claim, reset-password (2), staff login and employee
  create forms. Checked: with JavaScript off the form is `method="post"` and
  the button disabled; with it on, login works and no URL carries
  `password=`. tsc clean, unit 1711/1711. #706 asks the other developer to
  search the logs for `/login?…password=`.
- 2026-10-05 ~20:30 — **Phase 4 launched**: independent evaluation of
  `b40c47b..HEAD` (Opus 5.5, own worktree, port 3724, branch
  `worktree-agent-ac0937a6d72959e4e`). Writes `EVALUATION-2.md` in its
  scratch directory. Uses the DEMO student; `EVAL2-` test records only.
  `merge/staging-sync` at `8d903dd`.
- 2026-10-05 22:15 — **Session restarted.** The Phase 4 evaluator and both
  dev servers had stopped with the previous session. State found:
  `merge/staging-sync` and the evaluator's branch both at `8d903dd`, no
  commits from the evaluator, no `EVALUATION-2.md` on disk, `origin/staging`
  still `4e6f955`. Actions: evaluator resumed (same id) with a priority
  order (dialogs and Markdown security first) and told to list any `EVAL2-`
  records it already created; dev server restarted on port 3700 from
  `.claude/worktrees/staging-sync/web`. Port 3716 is not restarted (not
  needed — 3700 serves both portals).
- 2026-10-06 20:25 — **Phase 4 resumed a second time** (it hit the session
  limit ~22:30 on 5 Oct). What survived: its findings file
  `<scratchpad>/eval2/EVALUATION-2.md` and one commit on
  `worktree-agent-ac0937a6d72959e4e`: `78ff910` "super-admin account forms
  with a password post instead of GET" (same defect class as #706, in
  `super-admin/gov-officials/create-gov-form.tsx` and
  `super-admin/partners/create-vendor-form.tsx`; code-read only).
  - **The scratchpad was wiped between sessions**: all my check scripts,
    saved login states and `demo2/cred.txt` (the DEMO student's password)
    are gone. The DEMO student `s9292@…` needs a password reset from the
    owner's student profile page before anyone can log in as them.
  - Evaluator's results so far (all PASS): staging contained; only
    migration 0214 differs; no policy change; removed exports
    (`DayPlanCard`, `FeesDue`, `LatestNotices`) have no references left;
    only two server-action files changed (`notices/actions.ts`,
    `marks-entry/actions.ts`); tsc clean; unit 1711/1711; eslint errors only
    in `app/claim/page.tsx` and `e2e/fixtures/roles.ts`; login form safe with
    and without JavaScript (0 of 43 URLs carry the password); Markdown path
    inert at every display site for 7 attack payloads (0 script / iframe /
    img / handlers / `javascript:` / `data:` links, 0 alerts, 0 requests to
    the external host).
  - Evaluator's test records (it could not use the DEMO login): student
    `EVAL2-শিক্ষার্থী পরীক্ষক` (roll 89, S9293, id
    `c48f8abf-c180-49f8-92c0-8fd6f410741d`) with a login; three `EVAL2-xss…`
    publications; one `EVAL2-xss প্রশ্ন` question. The student, login and
    question cannot be removed from the app → add to #686 when it finishes.
  - Remaining for it: dialogs in depth, shared components on owner pages,
    requirement items A–O, jev. It now keeps a "VERDICT SO FAR" block at the
    top of its file.
  - Ports listening: 3700 (merged branch), 3724 (evaluator).
- 2026-10-06 ~21:10 — **New request (user, screenshot of the sidebar):
  the উপস্থিতি (Attendance) sub-menu should work "like Exams"; find the best
  UX; deep research + grilling.**
  - Facts from the code (`web/lib/school-nav.ts`): Exams is ONE sidebar
    item, sub-pages reached inside the page. Attendance is a child of
    "Classes" with FOUR always-visible grandchildren (Off-Day Calendar,
    Students, Employees, Machine), all with the same icon; each of those has
    2–4 more sub-pages as in-page tabs (`web/lib/attendance-nav.ts`,
    `attendance-tabs.tsx`). **This sidebar layout was a deliberate decision
    on `staging` (map #667, by the other developer): tabs were moved INTO
    the sidebar.** Changing it reverses that.
  - Research done (3 researchers + writer, Sonnet):
    `reports/Sidebar sub menu UX patterns.md`, notes in
    `research_notes/Sidebar sub menu UX patterns/` (main checkout,
    untracked). Recommendation: make Attendance a single sidebar item like
    Exams, with the four areas as ONE visible row of page links at the top
    of the page (`<nav>` links with `aria-current="page"`, not ARIA tabs),
    and a lighter control or flattening for each area's own sub-pages (two
    stacked tab rows are a known trap). Fallback: one-level click-to-expand
    group, no child icons. Basis: Carbon / Fluent 2 / Apple cap a sidebar at
    two tiers and send deeper levels to in-page tabs; only Fluent has an
    icon rule (icons on categories, none on sub-items); NN/g measured that
    hidden navigation is used less and is slower (so the four areas must
    stay visible). Weak points: Apple and Material pages did not render
    (snippets only); no study compares nested sidebar vs in-page tabs for
    admin apps; consistency argument is inference; Bangla label fit at
    360px untested.
  - **Next: grill the user (one question at a time), then implement on
    `merge/staging-sync`.** Open questions: (1) which pattern; (2) what to
    do with each area's second row of tabs; (3) keep Attendance under
    "Classes" or make it a top-level item like Exams; (4) phone drawer /
    bottom bar behaviour; (5) whether reversing map #667 needs the other
    developer's agreement.
  - The user asked to compact the context — everything needed to continue
    is in this file and in `plan-2026-10-05-finish-and-merge.md`.
  - Phase 4 evaluator still running (`<scratchpad>/eval2/EVALUATION-2.md`).
- 2026-10-06 ~22:30 — **Attendance navigation rebuilt (`ed7284f` on
  `merge/staging-sync`).** Grilling decisions: (1) one sidebar item with the
  areas as a row in the page; (2) Attendance is its OWN item between
  Class & Curriculum and Exams (not a child of Classes); (3) areas as
  underlined tabs, each area's pages as the small pill switch.
  - `web/lib/school-nav.ts`: Attendance item, no children; Classes has no
    children. `web/app/school/attendance/attendance-tabs.tsx`: area row
    (`SectionTabs`: শিক্ষার্থী, কর্মচারী, ছুটির দিন ক্যালেন্ডার, মেশিন হাজিরা)
    above the existing `SegmentedControl`. `attendanceGroupTabHrefs` removed
    (unused). Tests updated: `school-nav-groups.test.ts`, `routing.test.ts`
    (two tests encoded the old placement).
  - User then reported "tabs miss the page hierarchy at the top". Fixed for
    Attendance: new `attendanceCrumbs(activeHref, lang)` in
    `web/lib/school-crumbs.ts`; Machine (3 pages, via `MachinePageHeader`)
    and Grace Time had no breadcrumb and a hand-made title row — now
    `PageHeader` with "ড্যাশবোর্ড › পাঠদান ও অ্যাকাডেমিক › উপস্থিতি › area".
  - Browser, Bangla, 1440 and 390, five Attendance pages: sidebar shows one
    "উপস্থিতি" link (active), area row with the right area marked, breadcrumb
    on each, no overflow, 0 console errors. tsc clean, eslint clean, unit
    tests 1713/1713.
  - This reverses map #667 / issue #101 (the other developer's sidebar
    layout on staging) — say so in the PR description.
  - **Breadcrumb sweep agent launched** (Sonnet 5.5, port 3725, branch
    `worktree-agent-a1f2e2278eca4f6ca`): inventory of every owner and
    student page, add the trail where missing (about 20 owner pages have
    none), replace hand-made title rows with `PageHeader`; findings file
    `CRUMBS.md` in its scratch directory. Not to touch `attendance/**`.
  - Still running: Phase 4 evaluator (its range does not include `ed7284f`;
    the Attendance nav change needs a look in Phase 5).
- 2026-10-06 ~22:50 — **Issue + migration + staging-gap evaluation (user
  asked).** State: #676–#706, 29 open, 2 closed (#687, #692).
  `origin/staging` `4e6f955`; branch 0 behind / 245 ahead. `jev_verify` 5/5
  (0.91–0.99): only migration 0214 differs; no API route changed; frame
  headers relaxed for print routes only, same-origin; "all students" SMS can
  reach more than 1000 recipients on the branch; staging fully contained.
  - Ready to close after merge (built + verified on the branch): #705
    (pending Phase 4), #706 (plus the super-admin forms in the evaluator's
    commit `78ff910`, not merged yet).
  - Non-UI behaviour that differs from staging (the "gaps" list given to the
    user): exam class guard on 18 exam actions; `saveFeeRecord` fees-grant
    check, server-side due, overpayment refusal; publish blocked without
    class/scheme/bands and marks rules (blank ≠ 0, half-filled row refused,
    Bangla digits); routine overlap refusal; `revertLeave` (new action);
    attendance save leaves out unmarked on-leave students; mobile validation
    on student/employee saves; `due_at` on homework; `updatePublication`
    (new); SMS "all" paging past 1000; `stageSubjectCopy` (new redirect
    action); `frame-src 'self'` + framable print routes; password forms
    `method="post"`; English locale `en-IN`.
  - Server-action files that differ from staging (16): attendance
    `manual-actions`, classes, employees, exams (7 files), fees, notices,
    sms, staff, students.
- 2026-10-06 ~23:30 — **Issue execution wave started (user: "create a
  plan to execute the issues and start, spawn multiple agents").**
  Decisions: **migrations are WRITTEN, never applied** (shared database);
  scope this wave = **attendance and leave only**. Plan:
  `docs/handoff/plan-2026-10-06-attendance-migrations.md`. Code must work
  before and after each migration (fallback when a column/function is
  missing). Three agents, own worktrees from `ed7284f`:
  - M1 (Opus 5.5, port 3726, `worktree-agent-a787dc32a3ac1ee5a`):
    `0215_absent_day_skips_weekly_off_days.sql` — `is_absent_working_day`
    skips `schools.weekly_off_days`; student-callable "attendance was taken"
    function; student attendance page/home use it; impact on fines and SMS.
  - M2 (Sonnet 5.5, port 3727, `worktree-agent-a819a6e302dd534e8`):
    `0216_leave_decision_note.sql` — `decision_note`, `decided_at` on both
    leave tables; reject reason; alert uses `decided_at` (#680).
  - M3 (Sonnet 5.5, port 3728, `worktree-agent-abf2cad6b1c722a28`):
    `0217_employee_attendance_start.sql` — start day readable with the
    attendance grant (#693); "no record" state (#694).
  Each writes a section in `docs/handoff/migrations-attendance-rollout.md`
  (in its worktree — expect a three-way merge of that file).
  When they report: read the SQL first, merge, checks, jev on raw SQL,
  update #703 source file (`migration-index-703.md`) marking items
  "written, not applied", then an independent review of the three
  migrations together. Apply order later: 0214 → 0215 → 0216 → 0217.
- 2026-10-06 ~23:40 — User (screenshot): striped off-day cells → "more like
  Google Calendar". Done in the latest commit on `merge/staging-sync`
  ("off-days on the Off-Day Calendar are chips, not striped cells"),
  `off-days/leave-calendar.tsx`: chip in a plain cell, dot on phones.
  Browser: 0 striped cells, 10 chips, no overflow. **Same stripes remain on
  the Employee Attendance Calendar (`employee/attendance-calendar.tsx:95`) —
  left for now because M3 owns that file; remove after M3 merges.**
  - Agents running: Phase 4 evaluator, breadcrumb sweep, M1, M2, M3.
### 2026-10-07 ~21:00 — attendance migrations merged (written, not applied)

- `merge/staging-sync` is now `ea9537b`: `a036195` (last striped calendar cells removed), `f50a32d` (merge M3, `0217`), `78f00f6` (merge M1, `0215`), `ea9537b` (merge M2, `0216`). Conflicts resolved keeping both sides: `web/app/student/page.tsx`, `docs/handoff/migrations-attendance-rollout.md` (now sections 0215, 0216, 0217 in order).
- Checks on the merged branch: `tsc --noEmit` clean; `vitest run tests/unit` 155 files, 1748 passed; eslint has 1 error, `web/app/claim/page.tsx:33` (setState in effect), identical on `origin/staging` and not touched.
- I read the SQL of 0215 and 0216 and checked the schema facts they rely on (`schools.weekly_off_days smallint[]` 0206, `attendance_absence_notes` columns 0046, the 0146 trigger). `jev_review` on the raw SQL and the leave action: escalate, composite 0.61, correctness confidence 0.16–0.17 on both SQL files (low confidence, no named defect).
- #703 updated (29 items): 1.5, 4.0, 4.1, 4.4 marked "written, not applied"; 4.2 narrowed to a sync-time column; 4.5 added (SMS streak walk still counts weekly off-days). Comments on #680, #693, #694.
- Running: independent review of 0215–0217 together; breadcrumb sweep (resumed); Phase 4 evaluation (resumed; its branch has `78ff910` and `e6ace1e`, not merged).
- Not done: M3 not seen in a browser as owner and as class teacher; nothing applied; integration tests for the three migrations written and never run.
- The scratchpad was wiped again (login scripts, evaluator's findings file). The evaluator was told to keep findings in `docs/handoff/evaluation-2.md` on its branch.
- Owner decisions open: (1) SMS streak walk fix (4.5) changes which SMS is sent; (2) the portal absent figure can differ from the fine's count after 0215; (3) `absent-working-days-range.test.ts` and `fee-structures.test.ts` will fail once 0215 is applied; (4) should today with nobody recorded read "No record"; (5) should a reject reason be required; (6) two rejected `M2-EVAL` leaves to add to #686.

### 2026-10-07 ~21:30 — review of 0215–0217 acted on

- Independent review verdict: all three "apply as written"; 9 findings, none in the forward SQL. `jev_verify`: 10 verified, 0 contradicted, 1 for review (the 0216 rollback order, 0.59).
- `dd9653c` on `merge/staging-sync`: 0216 rollback order fixed (function before columns); 0215/0216/0217 end with `notify pgrst, 'reload schema'`; 0214 uses `create or replace`; Employees directory keeps "Not in yet" for today; rollout note corrected and given a review section. tsc clean, unit 1748/1748.
- Not changed, by choice: a reject reason typed before 0216 is applied is still not stored (returning an error there would fail every reject with a reason until the migration is applied).
- #703 now 31 items: 4.6 (anon can execute `is_absent_working_day`), 4.7 (range and archived classmates in `student_class_attendance_days`).
- Still running: breadcrumb sweep, Phase 4 evaluation.

### 2026-10-07 ~22:15 — staging adopted, migrations renumbered, issue wave 2 started

- `origin/staging` moved to `0ae8197` (4 commits: attendance school-local day, reconcile queue, Windows Attendance Agent schema; its own migrations `0214`–`0216`). Merged into `merge/staging-sync` with no conflict; branch is 0 behind.
- **Number collision fixed:** this branch's migrations renamed `0214`→`0217` (student attendance summary), `0215`→`0218` (weekly off-days), `0216`→`0219` (leave decision note), `0217`→`0220` (employee attendance start). References updated in `web/` and in the index, rollout note and 10-06 plan. Older entries of THIS log and the 10-05 plan still use the old numbers.
- Breadcrumb sweep merged (`b234fa5`): 21 files, trails on 11 pages that had none, 4 institute tabs, 5 student pages. Read by me: `fees/ledger` (back arrow to `/school` dropped, trail replaces it) and `fees/vouchers/[id]` (voucher number moved from the card to the page header). Not seen in a browser by the agent: 7 record pages with no seed data.
- Checks on `b234fa5`: tsc clean, unit 156 files / 1756, eslint only the inherited `app/claim/page.tsx:33`.
- Closed: #705, #676, #691 (not planned). #706 left open for the log check.
- Owner's answers (question tool): migrations "Apply on the shared database"; "one agent per group"; decisions "use your recommendation".
- **Applying is blocked from this session:** the connected Supabase account has only a project named `portfolio`, not the LMS project; the linked Supabase CLI call was refused by the permission system. Nothing was applied. Not to be worked around.
- Wave 2 agents (write migrations, never apply; base `fcb9600`): exams `0221`–`0229` (#702, #700, #679, #699, #698, #701); fees `0230`–`0239` (#678, #683, #695, #681); access `0240`–`0249` (#677, #688, #689, #690, #697, item 4.6); notices/portal `0250`–`0262` (#696, items 4.5, 4.2, 4.7, 5.x). Phase 4 evaluator still running.
- #703 source file updated for the renumbering; the GitHub edit failed 3 times with a server error — retry `gh issue edit 703 --body-file docs/handoff/migration-index-703.md`.

### 2026-10-08 ~07:05 — 0217–0220 applied to the shared database

- The owner connected the Supabase account that holds the LMS project and said to apply and test. Applied in order through the connector: `0217` student attendance summary, `0218` weekly off-days, `0219` leave decision note, `0220` employee attendance start. Recorded there as versions `20261008010230`, `20261008010300`, `20261008010325`, `20261008010334`.
- Found before applying: staging's own `0214`–`0216` were already in the database; none of ours was.
- Checked after, read-only: functions exist with `search_path = public`, new functions executable by `authenticated` only (`is_absent_working_day` still open to anon — #703 item 4.6), columns + 500-character checks + trigger in place. Sample of 200 students in schools with weekly off-days Fri+Sat, 1–7 Oct: absent days 1074 → 837, absences on Fri/Sat 237 → 0.
- 50 of 52 schools have Saturday only as weekly off-day (the default); for those, Fridays still count as absences.
- **Integration tests not run:** the run of the three new test files was refused by the permission system (shared database). Not worked around. `leave-decision-note.test.ts` deletes every leave of the seed student; narrow it to its own 2099 rows before anyone runs it.
- A detailed issue comment was refused for carrying database detail; issues got short notes instead. #684 closed. #680, #693 stay open until tested.
- All five agents hit the session limit at ~01:40 and were resumed (exams, fees, access, notices/portal, Phase 4 evaluation). They write migrations and never apply.

### 2026-10-08 ~07:50 — wave 2: three branches merged, second apply declined

- Merged into `merge/staging-sync` (tip `cdbb4972`), no conflicts: Phase 4 evaluation fixes (`78ff910` super-admin password forms, `e6ace1e` dialog SSR, `db69a5b` CRLF line ends; findings in `docs/handoff/evaluation-2.md`), notices/portal (`0250`–`0257`), exams (`0221`, `0223`, `0224`). Checks: tsc clean, unit 162 files / 1794, eslint only `app/claim/page.tsx:33`.
- Phase 4 verdict: ready with conditions. Open from it: fee roster says "collected" for a record with ৳0 received (`web/app/school/fees/page.tsx:319`), Bangla-digit leftovers on owner pages, `aria-current` on two calendars, small tap targets, DEMO student pages never checked (password lost).
- I read all 11 SQL files and ran their pre-checks read-only on the live database: all pass (live `absence_sms_candidates` and the publications policy match what 0250 and 0252 replace; no question over 4000 characters; no existing routine overlap; names free).
- **`0222` removed**: no all-zero marks row exists anywhere; #698 closed.
- **Apply of `0221` was declined at the permission prompt.** Nothing from wave 2 is applied. Not retried. Written, not applied: `0221`, `0223`, `0224`, `0250`–`0257`.
- Riskiest of the set: `0223` (marks columns lose NOT NULL; `student_exam_rank` counts a half-filled subject as 0) and `0250` (changes which absence SMS is sent).
- Not built: 5.9 (subject on homework/material), 5.7 (attachments), "absent" shown on mark sheet / result book / portal, staff delete of a question.
- Still running: fees agent (`0230`–`0239`), access agent (`0240`–`0249`).

### 2026-10-08 ~08:20 — fees branch merged

- Merged fees (`6b3345a1`): `0230` fee amount column (#678), `0231` void flow (#683), `0232` director capital guard (#681); #695 keeps the acknowledgement, no migration. Checks: tsc clean, unit 1830.
- Read the SQL and ran pre-checks read-only: constraint `one_record_per_student_month` present, no duplicate (student, month, year), live `fee_post_gl_delete` and `student_fee_record` match what `0231` replaces, helpers exist, 1 school has director-capital drift (Test School A, known). No app code on `staging` or the branch upserts on `(student_id, month, year)`, so dropping the named constraint breaks no caller. `fee_gl_post` fires only on `pay_amount`/`fine_amount` updates, so a void posts exactly one reversal.
- Not applied (apply was declined earlier; waiting for the owner). Whole void path never seen running.
- New finance needs from the agent, in the index change log: fine counted twice in the ledger when received includes it; `bank_cash_transactions` balance trigger is insert-only; a school member can delete a fee record through the API.
- Still running: access agent (`0240`–`0249`).

### 2026-10-08 ~09:00 — all wave 2 branches merged; partial apply

- `merge/staging-sync` tip `eb0d48e3`, 0 behind `origin/staging`, nothing pushed. Access branch merged (`0240`–`0245`; one conflict in `attendance/machine/page.tsx`, both sides kept). Checks: tsc clean, unit 168 files / 1858, eslint only `app/claim/page.tsx:33`.
- Owner said "approved" for the queue of 14. Applied: `0230`, `0250`, `0251` (verified read-only afterwards). **Declined by the Supabase connector: `0221` and `0223`.** Pattern: every file that applied had no `drop`/`delete` statement; both declined files have one (`drop policy if exists`, `drop not null`, a `delete` in a function body). The connector asks the user to confirm destructive statements and this session cannot show that prompt. I did not strip statements to get past it. Not attempted after that: `0224`, `0231`, `0232`, `0252`–`0257`.
- Applied in total on the shared database: `0217`, `0218`, `0219`, `0220`, `0230`, `0250`, `0251`.
- Access migrations `0240`–`0245` were not in the approved queue and I have not read their SQL line by line. Read-only facts: every caller of `is_absent_working_day` is a definer function and no policy or view calls it (so `0245` is safe); live `app_current_school_id()` is the 0131 body that `0242` expects; 2 staff logins belong to archived employees.
- Short status comments posted on #677–#683, #688–#690, #695–#697, #699–#702. #703 updated.
- Integration tests: still not run (refused by the permission system).
- Open issues that still need work or a decision: #682 (subscription page, needs product research, untouched), #685, #686 (test data cleanup; do it after `0232`), #704 (small defects + Phase 4 leftovers), #706 (log check).

### 2026-10-08 ~09:40 — apply file handed to the owner

- Connector declined `0221` a third time. Owner's answers (question tool): apply path = "I paste one SQL file"; access set = "all except optional 0242"; testing = "browser test in Test School A" (records prefixed `W2-`, read-only SQL checks; close an issue only when seen working); decisions = "#695 keep acknowledgement" only. Not accepted, so still open decisions: #697 (soft 404), #681 (Test School A drift), #682 (park).
- Built `docs/handoff/apply-wave2.sql` (2218 lines, one transaction, guard block first): `0221, 0223, 0224, 0231, 0232, 0240, 0241, 0243, 0244, 0245, 0252–0257`. Committed on the branch as `6f4a4f2b`; copy in the main checkout.
- I read the SQL of `0240`, `0241`, `0243`, `0244` and checked live: the 7 policy names `0240` replaces exist as expected; `owner_manages_staff`, `record_audit` (11 args) and the auth tables exist; `refresh_tokens.user_id` is varchar (the cast in `0241` is right); the live `workflow_instances` policy is the one `0243` replaces.
- Effect to watch right after applying, before the branch is deployed: 3 teacher logins hold the Attendance grant; with `0240` they can no longer write machines, machine enrollments, office hours or grace rules. The deployed app still shows them those pages until the PR is merged.
- #695 closed.
- NEXT, after the owner runs the file: verify read-only that every object exists; start the dev server (`npx next dev --webpack --port 3700` in the worktree's `web/`); browser-test each issue as owner / teacher / student; close the ones seen working; list the rest.

### 2026-10-08 ~10:15 — wave 2 applied by the owner; browser testing started

- The owner ran `docs/handoff/apply-wave2.sql`. Checked read-only: all 7 columns, 11 functions, 7 triggers, 2 tables (RLS on), the new policies, the partial unique fee index (old constraint gone), `is_absent_working_day` now executable by postgres and service_role only, publications policy carries `unpublished_at`. Old policies replaced by `0240`/`0243` are gone. Not applied: optional `0242`.
- Owner: "all decisions are approved" → #697 closed (soft 404 accepted), #682 parked, #681: leave Test School A drift, close once the guard is seen working. #695 closed earlier.
- `merge/staging-sync` tip `2e930672`. #703 updated.
- Three browser testers started (own worktrees from `2e930672`, own dev servers): attendance + access (port 3741, prefix `W2-ATT`, findings `docs/handoff/w2-test-attendance-access.md`), exams + fees (3742, `W2-EXF`, `w2-test-exams-fees.md`), notices + portal (3743, `W2-NOT`, `w2-test-notices-portal.md`). They may commit small fixes on their branches.
- NEXT: read each report, merge fixes, run checks, close each issue that was seen working; list the rest; add the `W2-` records to #686.

### 2026-10-08 ~20:40 — browser tests done; issues closed

- All three testers reported; findings merged into the branch: `docs/handoff/w2-test-{attendance-access,exams-fees,notices-portal}.md`. No tester changed application code. `merge/staging-sync` tip `6a0c9f84`, not pushed.
- Closed after being seen working: #677, #678, #679, #680, #683, #688, #689, #690, #693, #694, #696, #699, #700, #701, #702. Closed earlier today: #676, #684, #691, #695, #697, #698, #705.
- Still open: #681 (guard `0232` applied but never triggered; needs one refused delete through the API), #682 (parked), #685, #686 (test data: `W2-ATT`, `W2-EXF`, `W2-NOT`, `EVAL2-` lists are on the issue), #703 (index; new item 4.8), #704 (small defects, updated three times today), #706 (log check), #707 (NEW: fine counted twice on receipt and ledger).
- Not seen by any tester: a teacher seeing an approval they started (#689); a staff login with fee access but no void control (#683); the sync warning with a real heartbeat (#694); an already-open session of a disabled login (#688).
- UI: `3e9b114a` segmented control gets an even 4px gap (the Haiku agent's version was rejected, not merged); Year view of the Off-Day Calendar uses localized digits (merged). The user's two screenshots came from a stale dev server on port 3725 (old breadcrumb worktree); stopped. Current build runs on port 3700 from the staging-sync worktree.
- New standing rules saved to memory: verify context with jev on resume; Haiku for simple tasks; keep context small.
- Integration and e2e suites: still never run.

### 2026-10-08 ~21:10 — last wave started

- Owner's answers (question tool): #707 "received includes the fine"; #686 "through the app only" (DEMO data stays); #685 "not now"; #704 + item 4.8 "fix code ones, write 4.8".
- Running from tip `6a0c9f84`: (1) Opus, worktree: #707 code fix + `0258_fee_gl_fine_inside_received.sql`, and `0259_absent_days_start_at_admission.sql` (4.8) — writes, never applies; (2) Sonnet, worktree, port 3762: #704 code-only fixes, list in `docs/handoff/704-fixes.md`; (3) Sonnet, no worktree, uses the app on port 3700: #686 cleanup of `W2-ATT`/`W2-EXF`/`W2-NOT`/`EVAL2-`/`M2-EVAL` records through the app, plus one refused-delete check for #681 (guard `0232`).
- NEXT: review each diff (SQL first), merge, checks, pre-checks read-only, apply 0258/0259 (through the connector if no drop statement, else a paste file for the owner), close #681/#686/#707 on evidence, update #703/#704, final PR checklist.

### 2026-10-08 ~22:30 — last wave merged; 0259 applied; 0258 waits for approval

- `merge/staging-sync` tip `f63b5542`, 0 behind `origin/staging`, not pushed. tsc clean, unit 1886, eslint only `app/claim/page.tsx:33`. Dev server for this branch on port 3700.
- Merged: #704 code fixes (8, ledger `docs/handoff/704-fixes.md`), wording changes (owner said "Wording decisions approved"; applied as: leave status "নামঞ্জুর", disabled-login message `login.banned`, exam-deleted toast, follow-up discard confirm via `window.confirm`, "No record" unchanged, fee roster Due/Partial), fees agent (#707 receipt total = received; `0258`; `0259`).
- `0259` applied through the connector and checked: 0 of 31 sampled students absent before admission; function still not executable by anon/authenticated. Rule: admission day = day the student record was created (not the current enrollment's day, which changes on transfer/promotion).
- `0258` NOT applied: the owner approved the reading "received includes the fine" and asked for the migration to be written; applying a ledger posting change was not approved yet. It has no drop statement. 19 fee records carry a fine (8 outside test/demo schools by name).
- #686 closed (cleanup through the app). #681 open: the refused-delete check was blocked by the permission system (session token read); needs `director-capital-guard.test.ts` run by the owner or a permission rule.
- Open now: #681, #682 (parked), #685 (not now), #703 (index), #704 (remaining small items), #706 (owner's log check), #707 (until 0258 is applied).
- None of today's last-wave fixes was seen in a browser. Integration and e2e suites never run.
- PR checklist for the owner when ready: push `merge/staging-sync`; open PR to `staging`; description must note the reversal of map #667 / issue #101, the 23 migration files `0217`–`0259` (all applied except optional `0242` and `0258`), and that integration/e2e are an open gate.

### 2026-10-08 ~23:10 — closing round

- Owner's answers (question tool): #707 "I run it in the SQL editor"; #681 "close on what was verified"; #706/#682/#685 "close with a handover note"; #703 "close, move the rest to one new issue".
- Closed: #681, #682 (not planned), #685 (not planned), #703, #706. New: **#708** "Database follow-ups after the owner UI overhaul" holds every database need not yet written (memory rule updated: new migration needs go to #708).
- Applying `0258` through the connector was refused by the permission system ("production deploy"); so was copying the file into `docs/handoff/`. The owner pastes `web/supabase/migrations/0258_fee_gl_fine_inside_received.sql` (in the `staging-sync` worktree) into the Supabase SQL editor. After that: verify read-only (functions `fee_gl_fine_part`, `fee_gl_reverse`; view column `advance_amount`), check one receipt and the student fee page, close #707.
- Running: Sonnet agent (worktree from `f63b5542`, port 3771) on the remaining #704 items (tap targets, Escape layers, toasts over dialogs, Bangla amount in words, exam guard on scope error, leave Reject wording) plus a browser confirmation of this wave's fixes. When it reports: merge, checks, close #704 with what is left moved to #708 or a note.
- Open issues now: #704, #707, #708.

### 2026-10-08 ~22:40 — merge readiness round

- `0258` applied by the owner (paste); verified read-only: functions, fine split, view column `advance_amount`, triggers. Role checks run read-only as student / teacher / owner inside rolled-back transactions: all as expected. All 25 applied migrations have their objects in place.
- Owner decisions (grill for approvals): `0242` removed from the branch (`ddf2ff1b`); archiving an employee ALWAYS disables the linked staff login (code, tick box is fixed on).
- #704 second pass merged (`b831c3e5`): tap targets, Escape layers, sub-navigation at 390px, Bangla amount in words, exam guard on scope error, leave Reject wording. #704 closed.
- Checks at `b831c3e5`: tsc clean; unit 172 files / 1907; eslint only `app/claim/page.tsx:33`; `next build --webpack` exit 0 (206 dynamic routes listed). The project's plain `next build` (Turbopack) cannot run in this worktree (symlinked node_modules).
- #707: code fix + migration applied and verified read-only. The browser receipt check was NOT run: the permission system refused the agent's admission script. Open until the owner checks one receipt or decides to close.
- Open issues: #707, #708 (backlog, stays open).
- Left before the PR: integration + e2e (never run; 32 existing test files modified); the owner pushes and opens the PR; PR text must mention map #667 / issue #101 reversal, the CSP frame change on print routes, 25 migrations applied, and that migrations already changed live behaviour.

### 2026-10-08 ~23:20 — approvals settled, PR text written

- Owner's five approvals: `0242` removed; archive always disables the login; owner checks one #707 receipt himself on port 3700; PR first and the pipeline decides on integration/e2e; I write the PR text and the owner pushes.
- "Fill the gaps": archiving an employee with a staff login now disables the login FIRST and refuses the archive if that fails (non-owner). New string `employees.archiveNeedsOwner`. Not seen in a browser.
- PR text: `docs/handoff/pr-description.md` on the branch. Branch tip after this entry: see `git log -1` in the staging-sync worktree. Checks at the tip: tsc clean, unit 1907.
- Left for the owner: (1) receipt check for #707 (fee 100, fine 10, received 60 → Total 60; ledger cash 60, fine income 10, fee income 50); (2) disable two old test logins of archived employees in Test School A (`UXA-People Emp Test`, `ZZ566 Full`); (3) push `merge/staging-sync`, open the PR to `staging`, merge on a green pipeline.
- Open issues: #707, #708.

### 2026-10-08 ~23:50 — #707 verified and closed

- I ran the receipt check myself through the app on port 3700 (the user said "verify and complete the open tickets"): test student `W3-fee Student` (id `5cd5e643-…`, archived after), record `cb121b6b-…` (voided). Seen: 60 received with fine 10 → Total 60, ledger 1000 Dr 60 / 4400 Cr 10 / 4300 Cr 50; edit to 130 → Total 130, Advance 20, cash +70; void → 1000 Cr 130, 4300 Dr 120, 4400 Dr 10. `jev_verify`: 4 verified, the false control contradicted.
- #707 closed. Only #708 (backlog) is open.
- PR description updated for this and for the archive rule.
- Scripts: scratchpad `f707/run.mjs` (stages admit / collect / receipt / void / archive).

### 2026-10-09 ~00:20 — new feature started: QR verification on every print

- Owner's request: every print carries a QR; a scan opens a page without login. Grilled, four decisions: (1) scan shows a VERIFICATION PAGE WITH KEY FACTS, not the full document; (2) LITERALLY EVERY print (personal documents, class lists, routines, blank templates; lists never show names); (3) facts are LIVE, the QR carries the print date and the page warns when the record changed after printing; (4) delivered ON `merge/staging-sync` (so the branch is not finished until this is merged, checked and its migration pasted).
- Existing base it extends: ID card QR → `/verify/<students.public_token>` (migration 0065, `web/app/verify/[token]/page.tsx`, `web/lib/qr.ts`, `QrFooterRow` in `web/components/print/pieces.tsx`).
- Running: Opus agent, worktree from `17739946`, port 3781. Writes `0260_print_verification.sql` (adds `schools.public_token`, one definer function for scans; never applied by it), public page under `web/app/verify/d/`, shared URL helper, QR wired into every print. Notes in `docs/handoff/print-qr.md` on its branch.
- NEXT: review SQL and the public page myself (security: allow-list, no enumeration, anon grant), merge, checks + build, give the owner the migration to paste, verify read-only, browser-check scans, update the PR description (new public surface).

### 2026-10-09 ~02:30 — UI round merged; 0261 applied; QR being reworked

- `merge/staging-sync` tip `e10f2dcb`, not pushed. tsc clean, unit 1923, eslint only `app/claim/page.tsx:33`.
- Merged: motion/pulse/icons (one pulse per region, `web/lib/ui/concept-icons.ts`, `pickPulse`; note: school layout now calls `hubSummary` on every owner page for a sidebar badge), shared `DateField` (57 inputs, `web/components/ui/date-field.tsx`, `web/lib/date-field.ts`; super-admin dates and month/time inputs still native), pagination on every unbounded owner list (`pageRange`, per-table URL keys; audit in `docs/handoff/pagination-audit.md`).
- My own fixes: class routine print uses `PrintTrigger` (seen: popup, no new tab); Filled/Blank pills centred; `DrawerSection` is a button (the closed "Full profile" section could not open through `<details>`; seen fixed); labelled `PrintTrigger` is 44px on desktop too.
- Month-to-date attendance on the mark page: `0261_student_attendance_summary_since.sql` applied by the owner; checked read-only (invoker, anon cannot call, 300 rows, MTD 509/1434 vs YTD 927/4725, no MTD figure above YTD) and in the browser (label "এই মাসে"/"MTD", no YTD label). Glossary: "Monthly Attendance Rate" added to CONTEXT.md.
- QR on prints: built on branch `worktree-agent-aab7718f32955c155` (`0260_print_verification.sql`, `/verify/d/<kind>/<token>[/<ref>]?p=YYYYMMDD`). NOT merged. Owner's decision after review: result scans show TOTAL MARKS ONLY (the first version returned per-subject marks to anon so the server could compute GPA). Agent is reworking and merging base `7eb7cf5e`.
- NEXT: review the reworked 0260 SQL (anon grant, reference binding, nothing per subject), merge, checks + build, owner pastes 0260, verify read-only + scan pages in a browser, add 0260/0261 and the new public page to the PR description, update #708.

### 2026-10-09 ~04:30 — MERGED to staging (PR #709)

- QR rework merged into the branch (`bf9f4090`): result scans return totals only. Tip `398f4e20`: tsc clean, unit 1946, `next build --webpack` exit 0.
- Owner said "merge to the staging". Pushed `merge/staging-sync`, opened PR #709 (body = `docs/handoff/pr-description.md`). The repo has no GitHub Actions; the only checks are Vercel's, and the preview deployment passed. First merge attempt was refused by the permission system; after the owner repeated "push merge" it went through.
- **PR #709 merged 2026-10-08T17:11:54Z, merge commit `d2b5022d`; `origin/staging` = `d2b5022d` and contains `398f4e20`.**
- `0260_print_verification.sql` applied by the owner before the merge; checked read-only: `schools.public_token` on every school, no duplicates; `print_document_facts` (definer, search_path, anon may call), `print_tokens_self` (authenticated only); bad token / bad kind / another school's reference / another student's token all return null; a voided receipt returns `valid=false, reason=voided` and no amount; a template returns school name and logo only.
- All 27 migration files of the branch are now applied.
- Still to confirm: Vercel deployment of `staging` for `d2b5022d` and a live check of `/login` and one `/verify/d/...` page.
- Never run: integration and e2e suites (no pipeline exists for them).

### 2026-10-09 ~05:30 — staging live; follow-up work on the branch

- Staging deployment for merge commit `d2b5022d`: Vercel status success, URL `https://amar-school-3rznp7e25-salmansrizons-projects.vercel.app`. Live checks (signed out): `/login` 200; `/school` → `/login`; old `/verify/<bad>` 200; `/verify/d/...` bad token 404; a real class-routine scan for Test School A 200 with "✓ আসল", school, class, year, `noindex`. Pages behind login not checked on the live host.
- New commit on `merge/staging-sync`, NOT on staging: `26351115` profile topics as a two-column grid (`ProfileGrid`, `span="full"`, each section its own `@container`; student + employee profiles; seen at 1440px).
- Running: Opus agent (worktree from `26351115`, port 3791) on fixed print header/footer. Owner's decisions: compact ~24mm header band, same on every page; ~22mm footer on every page with a smaller QR, powered-by and "Page X / Y"; all A4 documents, not admit-card or ID-card sheets. Notes will be in `docs/handoff/print-header-footer.md` on its branch.
- NEXT: review + merge the print work, checks + build, then a second PR to `staging` for `26351115` and the print frame (the owner merges; `gh pr merge` needed the owner's explicit instruction last time).

### 2026-10-09 ~12:45 — second round on the branch (after PR #709)

- `staging` = `d2b5022d` (PR #709 merged, deployment live). `merge/staging-sync` local tip `0713b979`, clean, NOT pushed since `398f4e20`; everything below needs a second PR, which the owner merges.
- Merged since the first PR: profile topics grid (`26351115`); profile pages to the owner's mockup with `?tab=` tabs (`57ef635b`: header card, round avatar aside, tabs General/Academic/Guardian/Contact/Notes, `profile-art.tsx`); photos in lists + employee photo feature (`4dd95c0d`: `EntityAvatar src`, `web/lib/photos.ts` batch-signs per page, `0262_employee_photo.sql` WRITTEN — check below); phone list cards with full-width actions (`eab2aa2a`, shared DataTable, `data-row-more` on ⋮ triggers); print frame (`0713b979`: `PrintDocument` with a fixed 24mm header band and 22mm footer band on every page, footer pinned to the page bottom via `100vh` in the thead cell, QR 20mm, page number through `@page` margin boxes (Chromium only), school-logo watermark 150mm/120mm at 0.06 and no brand fallback, thin-border `print-table`, 19mm signature room, admit cards on the frame, ID cards untouched). I rendered the ledger to PDF and looked at it: bands, grid table, footer at the bottom, "পৃষ্ঠা ১ / ১".
- Checks at `0713b979`: tsc clean, unit 1968, eslint only `app/claim/page.tsx:33`. No production build run since `398f4e20`.
- Owner decisions this round: QR scan shows key facts, result totals only; every print gets the QR; print header compact band on every page; footer with QR + powered-by + page number on every page, always at the page bottom; A4 documents and admit cards, not ID cards; watermark = the school's own logo, big, centred, blank when none; thin-border tables; attendance book landscape and dense, no document on more pages than before; phone cards keep all fields with full-width buttons; phone controls centred and evened out but page header (breadcrumb + title) LEFT-aligned; photos: students now, employee photos as a new feature.
- Running (both resumed after the session limit at 12:40): print agent `a40157b034312f18e` on the page-budget pass (measure every print on base `26351115` vs tip; attendance book 6 → 14 pages must come back to at most 6); mobile agent `a617ace90a865e518` (had 12 uncommitted files; told to commit, left-align the header, merge `0713b979`).
- NEXT: merge both, checks + production build, PDF spot-check, update `docs/handoff/pr-description.md` for a second PR (profile, photos, print frame, mobile, `0262`), push and open the PR when the owner says; the owner merges or repeats the instruction.

### 2026-10-09 ~14:10 — mobile pass, 0262 applied, print page budget

- `merge/staging-sync` local tip `23ac041c` (not pushed since `398f4e20`). tsc clean, unit 1968.
- Mobile centring merged (`9f9f79a0`): tabs/segmented control full width or scrolling, filters full width, header actions equal widths; page header LEFT-aligned (my measure: breadcrumb, title and cards share the left edge at 390px and 1440px). Leftovers handed back to the same agent (student question submit, institute save button, count-beside-button rows) — running.
- `0262_employee_photo.sql` applied by the owner; checked read-only (nullable column, private bucket 2 MB jpeg/png/webp, five policies to `authenticated`, all scoped by school folder, none for anon). Upload path tested by me through the app on a test employee I created (`W3-photo Employee`, archived after): file input present, photo shows on the profile (200x200) and in the employee list as a signed `employee-photos` URL.
- Print page budget merged (`23ac041c`): every print is on the same or fewer pages than base `26351115` except the attendance book (whole school, 277 students: 6 shrunk portrait pages before → 8 unscaled landscape pages at 9pt). Owner's decision: keep landscape, 8 pages. Table of before/after in `docs/handoff/print-header-footer.md`. Smallest printed text 8.5pt.
- All migration files on the branch are applied (`0217`–`0262`, without `0222` and `0242`).
- NEXT: merge the mobile leftovers; production build; update `docs/handoff/pr-description.md` for the second PR (profile + mockup, photos + `0262`, phone cards, print frame/watermark/tables/page budget, mobile alignment); push and open the PR when the owner says.

- If the session dies: find the implementer branches with
  `git branch --list 'worktree-agent-*' --sort=-committerdate | head` and
  `git log merge/staging-sync..<branch> --oneline`; merge finished ones into
  `merge/staging-sync` one at a time (expect `web/lib/i18n.ts` conflicts —
  both sides add keys; keep both), re-run tsc / eslint / `vitest tests/unit`.
- Still to do after Phase A: merge the four branches; Phase B cross-cutting
  sweep; Phase C independent evaluation with jev; report to the user.
