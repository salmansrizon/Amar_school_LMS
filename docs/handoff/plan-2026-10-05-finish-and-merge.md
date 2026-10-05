# Plan — finish the open work and get one pull request ready for `staging`

Written 2026-10-05 after a state check with jev and a grilling session with
the owner. History and detail are in
`docs/handoff/2026-10-03-owner-ui-staging-sync.md`; this file is only what is
left to do, in what order, and how it is checked.

## State, verified

Checked with git, `gh` and `jev_verify` (6 claims) on 2026-10-05.

| Fact | Evidence | jev |
|---|---|---|
| `merge/staging-sync` and `feat/student-portal-overhaul` are the same commit, `1db79d4` | `git rev-parse` | — |
| `origin/staging` is `4e6f955`; the branch is 0 behind, 217 ahead | `git rev-list --left-right --count` | verified, 0.44 on "ready for a PR" (it is not ready — see gates) |
| Nothing is pushed; no PR exists for this work | `git ls-remote`, `gh pr list` | verified 0.90 |
| `docs/revamp` (`e283463`, 7 commits) is not merged | `git rev-list` | "is merged" contradicted 0.98 |
| Only 2 of the 4 done-bar commands have run (typecheck clean, unit 1696/1696) | — | "all four ran" contradicted 1.0 |
| 28 issues open (#676–#705 except #687, #692) | `gh issue list` | "all closed" contradicted 1.0 |
| The main checkout has uncommitted deletions: `ui/` (147 files), `figma/`, `handsoff/`, loose files, `Design System/new ui` | `git status` | verified 0.86 |

## Decisions (owner, 2026-10-05)

1. **Tests that write to the shared database are not run from this machine.**
   Integration (105 files, 403 deletes) and e2e stay an open gate for whoever
   merges to `staging`, in the normal pipeline.
2. **Exam guard stays as ADR 0021 describes:** an employee with no class
   attached cannot change an exam that has a class. A head teacher who manages
   all exams is office staff (no employee record) or the Owner.
3. **English uses lakh grouping too** (`en-IN`). Super-admin, agent and
   distributor pages still hard-code Western grouping → follow-up issue.
4. **Build the homework due date now** (#705). Column exists; one server
   action changes.
5. **Student tasks and notices: compact rows on phones, generic table from
   640px up.**
6. **`ui/` was deleted on purpose; the prototype site is retired.** Root
   `index.html` and `.nojekyll` go too.
7. **One pull request:** docs revamp and repo cleanup are merged into
   `merge/staging-sync`.
8. **Create a DEMO student** in an active-year class of Test School A with
   full demo data (no SMS, ৳0 received).

Still open — the listed default applies until the owner says otherwise:

| Question | Default in the code now |
|---|---|
| Glossary Q1–Q4, Q9 (Bangla wording) | No wording changed |
| Attendance under 75%: amber alert but red card | As built |
| Exam guard: Subject Teachers of the class allowed; class-less exam open to all | As built |
| Publishing blocked when the grading scheme has no bands | As built |
| `home.yml`, `routes.txt`, `ux-audit.md`, `ux-journey-map.md`, `010_exam_system.md` | Kept |

## Work, in order

### Phase 1 — code, three agents in parallel
Each in its own worktree from `merge/staging-sync`, commits on its own branch,
never pushes, no migration, no RLS change, runs typecheck + eslint + unit
tests, checks in a browser at 390px and 1440px in Bangla and English, runs
`jev_review` on raw diffs and `jev_verify` on its claims, lists migration
needs separately.

| # | Work | Files it owns | Model |
|---|---|---|---|
| 1A | **Homework due date (#705).** Optional date on the homework create and edit form (homework type only); `createPublication` / `updatePublication` store `due_at`; show it on the owner notices list and detail and the teacher's task page; clearing it works. Rule for the time of day: end of the school day in Asia/Dhaka, matching how the student portal compares days. Unit tests for the input mapping; browser: set, edit, clear, and the student's pile changes. | `web/app/school/notices/**`, `web/lib/publications*`, `web/app/school/my-classes/**` (display only), tests | Opus 5.5 |
| 1B | **Compact phone rows for student tasks and notices.** Below 640px: one-line rows (title, date, state rail, the done toggle for tasks) with the same search and filter controls; from 640px the `DataTable` as now. Do not edit `components/data-table/`. Also: the tasks default filter label "All Open tasks", the unused `student.col.action` key. | `web/app/student/tasks/page.tsx`, `web/app/student/notices/page.tsx`, `web/lib/student/table.ts`, tests | Sonnet 5.5 |
| 1C | **Small defects from #704 that need no decision.** Toasts above open dialogs; one Escape closes one layer (confirm inside the exam route modal); select and dropdown-menu inside a dialog checked in a browser; Bangla leftovers (ISO dates on leave / exam list / routine, Latin digits in result book, promotion, "· 1 ছুটিতে", leave tab counts, off-day heading year); Bangla digits accepted in the marks grid; tap targets on the student leave page for owners (Approve / Reject), exam setup, staff page; page titles on dashboard, exam setup, off-day calendar; the unlabeled search input. Each item its own commit; anything that needs wording or a migration is reported, not done. | Shared dialog + toaster wiring, the listed owner pages; NOT `web/app/student/**`, NOT `web/app/school/notices/**` | Sonnet 5.5 |

Merge order: 1A, 1B, 1C into `merge/staging-sync`; after each: typecheck,
eslint, unit tests, my own read of the risky files, `jev_gate` on the real
diff.

### Phase 2 — one branch (done by me, no agent)
1. Merge `docs/revamp` into `merge/staging-sync`. Replace the handoff
   snapshot in it with the current working copy; add this plan, the demo
   manifest, the rich-text scope and the cleanup report.
2. Commit the repo cleanup on `merge/staging-sync`: remove `ui/`,
   `index.html`, `.nojekyll`, `figma/`, `handsoff/`, `dashboard-desktop.png`,
   `docs.code-workspace`. Keep `graphify-out/`, `home.yml`, `routes.txt`,
   `Design System/` (the owner is reorganising it; not in this commit).
3. Reference check: list every place in `web/`, `docs/`, `CONTEXT.md`,
   `README.md` that names a removed path (44 code comments cite `ui/…`).
   Comments are not rewritten in this PR; they go into one follow-up issue.
   `docs/README.md` and any doc that links into `ui/` get the link removed or
   marked "retired prototype".
4. Note for the owner: the GitHub Pages site is served from `main`; it stops
   working when this reaches `main`, not when it reaches `staging`.

### Phase 3 — demo data (one agent, after 1A is merged)
Through the running app only, in Test School A only, everything prefixed
`DEMO`, manifest kept current in `docs/handoff/student-demo-data-2026-10-05.md`:
admit one DEMO student into an existing active-year class and give them a
login; routine periods for that class (only if the class has none); a DEMO
exam with a schedule (no marks, not published); attendance for a few working
days with one absence (cancel if any SMS is offered); one fee record with an
amount due and ৳0 received; study material without file upload; dated
homework (overdue, today, tomorrow, next week). Then, as that student:
screenshots of every page at 390px and 1440px and a coverage table. Never
edits existing records or school settings.

### Phase 4 — independent evaluation (one agent, Opus 5.5)
Scope: everything since the last evaluation (`b40c47b..HEAD`) — student
portal redesign, animations, calendars, tables, questions editor and threads,
rich text, due date, Phase 1 fixes — plus a regression pass on the owner
flows the first evaluation confirmed. It must observe, not trust reports:
both portals, both languages, 390px and 1440px, with the DEMO student's data.
`jev_review` per file on raw diffs for the risky files, `jev_verify` on every
verdict. It may fix only small confirmed defects, one commit each. Verdict:
ready / ready with conditions / not ready.

### Phase 5 — close out (me)
1. Act on the evaluation; re-run checks.
2. Issues: close #705 if built and verified; update #704 with what is fixed;
   comment #676 with the owner's decision; new issues for (a) Western grouping
   left on super-admin / agent pages, (b) code comments citing the retired
   `ui/` prototype; add any new migration need to #703.
3. Final check: `origin/staging` still contained, no new migration file, no
   exported function or file removed by accident, typecheck, eslint, unit
   tests, owner + student smoke test.
4. Update the handoff. Report the PR checklist to the owner. **The owner opens
   the pull request; nothing is pushed by me.**

## Gates that stay open after this plan

- `npm test`, `npm run test:integration` and the Playwright e2e suite on the
  merged branch (owner's decision 1) — to be run in the pipeline.
- Migration `0214` applied to the staging database (#684).
- The 28 database items in #703, first of all item 4.0 (weekly off-days
  counted as absences; affects fines and SMS) and #702 (students cannot read
  grading schemes).
- Test and demo records in Test School A (#686 and the demo manifest).
- The owner's uncommitted edits in the main checkout, and
  `feat/owner-ui-overhaul`, which is still at `13db5c5`.

## How each step is judged

A step is accepted only when: the diff was read by me (not only the agent's
report); typecheck, eslint and unit tests pass on the merged branch; the
behaviour was seen in a browser or the gap is stated; jev's verdict is
reported as returned, and where it disagrees with what was observed, both are
shown with the reason for trusting one.
