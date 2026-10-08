# Owner UI overhaul, student portal redesign, and the audit fixes

Base: `staging` (`0ae8197`). Head: `merge/staging-sync`. The branch contains all of `staging` and merges as a fast-forward.

## Read this first

1. **The database is already changed.** Staging and production share one database, and the 26 migration files in this branch (`0217`–`0261`, listed below) are applied to it. The rules in "Behaviour that changed in the database" are live now, for the deployed app too, before this merge.
2. **Integration and e2e have not been run on this branch.** Typecheck, unit tests and a production build pass (figures below). The branch edits 32 existing integration/e2e test files to match the new rules, so the suites must run in the pipeline before merging.
3. **One security header changes.** Print routes can now be framed by our own pages, for the print preview popup: `frame-ancestors 'self'` on print routes, and `frame-src 'self'` everywhere. `staging` has `'none'` for both (`web/lib/auth/csp.ts`, `web/proxy.ts`).
4. **This reverses map #667 / issue #101**: the School Owner sidebar is regrouped, and Attendance is one sidebar item with its areas (Students, Employees, Off-Day Calendar, Machine) as tabs inside the page.

## What is in it

**School Owner portal**
- Sidebar regrouped; breadcrumb trail on every page; shared tables, dialogs and calendars.
- All month calendars use one layout (bordered grid, chips, today circle, digits in the page language).
- Attendance: one sidebar item; leave rejection with a reason and a decision date; "No record" on days with no employee rows; employee-side pages for the Owner and office staff only.
- Exams: Absent tick and blank components in marks entry; one database call per save; routine overlap checked across exams of a class; subject switch no longer opens a popup.
- Fees: stored fee amount and advance line on the receipt; void with a reason and a reversing ledger entry; receipt total equals the amount received; Bangla amount in words.
- Notices: homework due date; unpublish and republish for notices.
- Staff: a login can be disabled and re-enabled; an employee with a staff login is archived only together with disabling that login (School Owner only).

**Both portals (added last)**
- One shared date picker replaces the browser's on every date field (Bangla digits and month names, month and year jump, keyboard support, bottom sheet on phones). Forms still receive `YYYY-MM-DD`.
- Every unbounded list is paged with the existing pager; leave requests page on the server.
- Live pulse only on the first item that needs attention in a region; one icon per concept across both sidebars; short transitions, all off under reduced motion.
- The attendance mark page shows this month's attendance rate (`0261`); the yearly Attendance Rate stays the definition elsewhere (CONTEXT.md gains "Monthly Attendance Rate").
- Every print button opens the shared print popup (the class routine opened a new tab before).

**Student portal**
- Short menu, home with what is pending and urgent, tables with search and filters, compact rows on phones.
- Questions with a rich-text editor, follow-ups in one conversation, several replies, a "new reply" mark, a 4000-character limit, and withdraw for an unanswered question.
- Grades, GPA and pass state on published results; attendance judged on the days the class was marked.

**Repo**
- The retired `ui/` prototype, `figma/` and `handsoff/` are removed; `docs/` is reorganised.

## Behaviour that changed in the database

| Area | Before | Now | Migration |
|---|---|---|---|
| Absent days | Weekly off-days counted as absences | Not counted | `0218` |
| Absent days | Counted from before the student was admitted | Start at the admission day | `0259` |
| Absence SMS streak | Counted weekend days inside a streak | Skips weekly off-days | `0250` |
| Employee attendance settings (machines, office hours, grace rules) | Any staff login could write some of them through the API | Owner and office staff with the Attendance grant | `0240` |
| Approvals list | Every member saw the whole school's queue | Owner, the current approver, the initiator, earlier deciders, office staff with the Attendance grant | `0243` |
| Fee ledger posting | Cash debited by received plus fine | Cash debited by received; fine income is the smaller of fine and received | `0258` |
| Fee uniqueness | Constraint on (student, month, year) | Partial unique index on records that are not voided | `0231` |
| `is_absent_working_day` | Callable by anyone | Not callable by `anon` or signed-in users directly | `0245` |
| Marks | Components were NOT NULL | A blank component means "not entered" | `0223` |

Existing ledger entries are not rewritten. `docs/handoff/migrations-fees-rollout.md`, section 4, has the query that lists entries posted under the old fine rule.

## Migrations (all applied)

`0217` student attendance summary · `0218` weekly off-days · `0219` leave decision note · `0220` employee attendance start · `0221` student reads grading scheme · `0223` absent marks and atomic save · `0224` routine overlap · `0230` fee amount · `0231` fee void · `0232` director capital guard · `0240` employee attendance admin · `0241` staff login disable · `0243` approvals scope · `0244` roll edit check · `0245` revoke `is_absent_working_day` · `0250` SMS streak · `0251` class attendance days · `0252` notice unpublish · `0253`–`0257` student questions · `0258` fee ledger fine rule · `0259` absences from admission · `0261` attendance summary from a given day.

Numbers `0222` and `0242` are intentionally absent. `staging`'s own `0214`–`0216` are untouched. Rollout notes with pre-checks and rollback: `docs/handoff/migrations-*-rollout.md`.

## Tested

- `tsc --noEmit`: clean.
- Unit tests: 1923 passed.
- `next build --webpack`: passes.
- eslint: one error, `web/app/claim/page.tsx:33`, identical on `staging`.
- Browser tests in Test School A as owner, office staff, teacher and student (reports in `docs/handoff/w2-test-*.md`, `docs/handoff/evaluation-2.md`, `docs/handoff/704-fixes.md`).
- Database: objects of all 26 migrations present; read-only role checks as student, teacher and owner.
- Fee ledger under `0258`, on a test record: received 60 with fine 10 posts cash 60, fine income 10, fee income 50; an edit to 130 moves cash by 70; a void returns every account to zero.

## Not tested

- `npm run test:integration` and the Playwright e2e suite.
- The director capital delete guard (`0232`) being triggered.
- A staff session that was already open when its login was disabled; the token stays valid for up to one hour.
- Super-admin pages in a browser; Safari and Firefox.

## Follow-ups

- #708 lists the database changes not yet written.
- Test records remain in Test School A as archived rows (list on #686).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
