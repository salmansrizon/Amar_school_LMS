# Pagination audit (School Owner and Student portals)

Convention (shared `web/components/pager.tsx`, `web/lib/url-params.ts`): `?page=` and `?size=` (10/20/50, default 20), "showing X–Y / N", 44px targets on phones. A second table on the same page uses its own keys (`rpage`/`rsize`, `opage`/`osize`, `lpage`/`lsize`); `Pager` takes `pageParam`/`sizeParam`, `withParams(..., own)` keeps the other table's page. A filter change drops every `*page` key. `paginate()` (client slice) and `pageRange()` (server `range()`) both clamp an out-of-range page to the last page.

Mode: **server** = `count` + `range()` query; **client** = list already loaded in full for another reason (search over names, roster filter, stat totals), sliced after.

## School Owner (`web/app/school/**`)

| Table | Page | Pages today | Rows | Action |
|---|---|---|---|---|
| Leave request roster (students) | attendance/leave/student | no | unbounded | client, `rpage`/`rsize` |
| Student leave requests | attendance/leave/student | yes, but capped at 100/500 rows in memory | unbounded | now server; chip counts are totals |
| Leave request roster (employees) | attendance/leave/employee | no | unbounded | client, `rpage`/`rsize` |
| Employee leave requests | attendance/leave/employee | capped in memory | unbounded | now server |
| Pending approvals | approvals | no | unbounded | client (stat cards need the full set) |
| Per-teacher response table | questions/response | no | one row per teacher | client |
| SMS off days | sms/rules | no | unbounded (up to 100 read) | client, `opage`/`osize` |
| SMS leaves | sms/rules | no | unbounded (up to 100 read) | client, `lpage`/`lsize` |
| SMS absence rules | sms/rules | no | a handful | left unpaged, bounded |
| Old classes | classes/archive | no | unbounded | client |
| Old employees | employees/archive | no | unbounded | client |
| Syllabus per class | classes/syllabus | no | one row per class | client |
| Result inquiry | exams/result-inquiry | no | students of a class | client |
| Result book | exams/[id]/result-book | no | students of a class | client |
| Admit card picker | exams/[id]/admit-cards | no | students of a class | client |
| Mark sheet picker | exams/[id]/printables | no | students of a class | client |
| Fee collection class roster | fees | no | students of a class | client, `rpage`/`rsize` |
| Grace-time ad hoc exemptions | attendance/employee/grace-time | no | up to 200 read | client |
| Holiday list | attendance/off-days | no | holidays of a year | client |
| Student RFID entry | attendance/machine/students | no | unbounded | client (page slice; card lookup only for the page) |
| Employee RFID entry | attendance/machine/employees | no | headcount | client |
| Logistics index | institute/logistics | no | unbounded | client component, page from the URL |
| Students, archive, employees, staff, classes, exams, notices, questions, feedback, corrections, activity, SMS log, fee vouchers/assets/structures/director capital, fee records | various | yes | unbounded | unchanged (already correct) |
| Bank accounts | fees/bank | no | a few accounts | left unpaged, bounded |
| Rooms per building | institute/venues | no | rooms of one building | left unpaged, bounded |
| Transfer history | students/[id]/transfer | no | one student's moves | left unpaged, bounded |
| Fixed templates | institute/templates | no | fixed list | left unpaged, bounded |
| Grace-time standing rules, office hours | attendance/employee | no | few; office hours is a period x day grid | left unpaged |
| Exam setup subject / seat plan / routine / grading bands | exams/[id]/* | no | subjects or rooms of one exam | left unpaged, bounded |
| Class subject list | classes | no | subjects of one class | left unpaged, bounded |

## Left unpaged on purpose (not lists)

- Printable pages and previews: `**/print/**`, `exams/[id]/attendance-sheet`, `student-log/[studentId]` (the on-screen sheet is the printable), receipts, `fees/print`.
- Calendars and matrices: attendance book, employee attendance calendar, off-days calendar and leave calendar, checklist report (date x item), co-curricular grid (student x item), routine and exam routine grids.
- Entry grids: marks entry, attendance mark form, promotion table (checkbox bulk action over the whole class).
- Out of scope: super-admin and distributor portals.

## Student (`web/app/student/**`)

Exams, fees, leave, materials, notices, questions, results and tasks already page through DataTable with `page`/`size` (client slicing of rows the portal read in full). `routine` is a period x day grid and `results/[examId]` is the subjects of one exam; both are left unpaged. `fees/print` and `routine/print` are printable.
