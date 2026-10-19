# People and access migrations — rollout notes (written, not applied)

Issues #677, #688, #689, #690, #697 and migration index #703 item 4.6.
Six files, numbers 0240–0245, in `web/supabase/migrations/`. **None is applied.
No SQL was run against any database while writing them.** Staging and production
share one database: apply on a branch database first.

The app works before and after every file. Each file's header holds the full
text of its pre-check queries and its rollback SQL; this page is the summary and
the order.

## Order

| # | File | Issue | Depends on | Can be skipped |
|---|---|---|---|---|
| 1 | `0245_revoke_is_absent_working_day.sql` | #703 item 4.6 | after `0218` | yes |
| 2 | `0240_employee_attendance_admin_rls.sql` | #677 | — | yes |
| 3 | `0244_student_roll_unique_in_offering.sql` | #690 | — | yes |
| 4 | `0243_approvals_scoped_to_reach.sql` | #689 | — | yes |
| 5 | `0241_staff_login_disable.sql` | #688 | — | yes |
| 6 | `0242_disabled_staff_login_has_no_school.sql` | #688, second lock | **0241** | yes — optional |

The files do not depend on each other except 0242 on 0241. The order above is
lowest risk first. To roll back, go in reverse; **0242 must be rolled back before
0241** (its function reads the column 0241 adds).

After each file: run `web/tests/integration/access-rollout-0240-0245.test.ts`
(written, **never run**; each block skips itself while its migration is missing)
and the existing suites named under each section.

## 0245 — revoke direct execute on `is_absent_working_day`

- **What:** `revoke execute on function public.is_absent_working_day(uuid, uuid, date) from public, anon, authenticated`. Function body untouched.
- **Why:** a definer function with default grants; anyone with the anon key and a student id could ask about a Student's attendance on a date.
- **Pre-check:** (1) the signature exists once; (2) the live grants; (3) **every function whose body calls it has `prosecdef = true`** — a `false` row is a caller that would break, stop; (4) no policy or view calls it.
- **Expected change per role:** none on any screen. The direct API call is refused for everyone.
- **Tests changed in the same commit:** `absence-sms.test.ts` (was an anon call at line 114) and `absent-day-weekly-off.test.ts` (was an Owner call) now ask `absent_working_days_in_range` for one day. Both give the same answer before and after.
- **Rollback:** `grant execute … to public; grant execute … to anon, authenticated;`

## 0240 — employee attendance configuration: Owner and office staff only (#677)

- **Decision taken:** not owner-only (option A) and not a new permission (option B). The employee side of Attendance stays inside the Attendance grant for the **School Owner and office staff**; a Staff User who has an `employees` row (a teacher) is refused. No School has to re-grant anyone.
- **What:** on seven tables (`attendance_machines`, `machine_enroll_infos`, `category_office_hours`, `standing_grace_rules`, `standing_grace_rule_categories`, `ad_hoc_grace_exemptions`, `ad_hoc_grace_exemption_categories`) the one `for all` policy becomes a read policy with **today's predicate** plus a write policy that needs: same School, the Attendance grant, and Owner-or-no-employees-row.
- **Also closes:** the Office Hour and grace tables had no grant term at all, so any Staff User could write them through the API.
- **Pre-check:** (1) the policies on the seven tables are exactly the ones the migrations created; (2) the list of teachers holding `attendance` (the people who lose write access); (3) the three helper functions exist.
- **Expected change per role:**
  - School Owner, office staff with Attendance: none.
  - Office staff without Attendance: can no longer write Office Hour / grace rows through the API (never could in the app).
  - Class teacher / subject teacher: read unchanged, write refused.
  - Student, anon, Super Admin: none.
- **App side (already in the code, works without the migration):** `web/lib/school/employee-attendance-admin.ts`. Teachers are refused on `/school/attendance/employee`, `…/employee/office-hour`, `…/employee/grace-time`, `…/leave/employee`, `…/machine`, `…/machine/students`, `…/machine/employees`; the Employees and Machine areas are hidden from their tab row; the write actions and employee-leave actions refuse them.
- **Not narrowed in the database:** `employee_leaves` and employee `attendance_records`. Reads there are shared with other screens; the app refuses teachers, RLS still follows the Attendance grant.
- **Existing suites to re-run:** `category-office-hours`, `ad-hoc-grace-exemptions`, `employees-grace`, `machine-attendance`, `machine-enroll-infos`, `attendance-employee-book`.
- **Rollback:** in the file header — drops the two new policies per table and re-creates the original one, table by table.
- **To reverse the decision:** roll back, and make `mayAdministerEmployeeAttendance` return `true`.

## 0244 — a manual roll edit must be free in the class offering (#690)

- **Finding:** both unique indexes exist in the migrations (`students_roll_unique` 0120, `student_enrollments_roll_unique` 0181) and a later browser check could not reproduce the issue for admission. The remaining gap is the **edit form**: it writes only `students.roll_number`, whose index is keyed on class *text* and is silent when that text is empty or differs.
- **What:** a `before update of roll_number` trigger on `students`. A manual edit to a roll another current member of the same Class Offering holds (in either copy of the roll) is refused with SQLSTATE 23505 naming `students_roll_unique`, so the existing Bangla message shows.
- **Tolerates existing rows:** it is a trigger, not an index — it never looks at rows that are not being written. Existing duplicates stay and can be saved unchanged. The sync write after admission / transfer / promotion (roll = the Student's own Enrollment roll) is always let through.
- **Pre-check (answers the issue's "not yet known"):** (1) both indexes exist and are valid, with their definitions; (2) the two "FIX-People … R1 / R2" students with both copies of their roll; (3) duplicate Enrollment rolls per Offering; (4) duplicate *shown* rolls per Offering; (5) how many Students have the two copies disagreeing. None has to be zero to apply.
- **If pre-check 1 shows an index missing or invalid:** clean the duplicates from query 3 / 4, then re-run the `create unique index` statement from 0181 / 0120. Not included here on purpose: it would fail on existing duplicates.
- **Expected change per role:** Owner, office staff, class teacher — a duplicate manual roll edit is refused. Nobody else can update a Student.
- **Not covered in the database:** admission with a typed roll that collides only with a classmate's *shown* (drifted) roll. The app pre-check (`web/lib/school/roll-check.ts`) covers it; a database rule there could block bulk promotion, so none was written.
- **Existing suites to re-run:** `enrollment-transitions`, `seat-plan-v2`, `start-academic-year`.
- **Rollback:** `drop trigger … on public.students; drop function …;`

## 0243 — approvals are read only within reach (#689)

- **Decision taken:** a member reads a workflow instance when they are the Owner, an approver of its current stage, its initiator, an earlier decider, **or office staff holding the Attendance grant** (for `leave_approval` and `attendance_correction` only).
- **What:** new `workflow_instance_in_reach(...)`; policy `members read own instances` replaced by `members read instances in reach`; `workflow_instance_visible` redefined to the same reach (so steps, comments, attachments and the comment/attach RPCs follow).
- **Pre-check:** (1) the live policy and `workflow_instance_visible` are the 0082/0084 ones; (2) stages that name someone other than the Owner; (3) **definitions that have school instances** — anything besides the two attendance workflows is not shown to office staff after this, decide first; (4) who started the existing instances.
- **Expected change per role:**
  - School Owner: none.
  - Office staff with Attendance: none for leave / attendance-correction approvals.
  - Office staff without Attendance, class teacher, subject teacher: lose the school-wide list and the dashboard count; keep what they started, can decide, or decided.
  - Student, anon, Super Admin: none. Nobody loses the ability to decide.
- **App side (already in the code):** `web/lib/school/approvals-reach.ts` applies the same rule on the Approvals page and the dashboard count.
- **Existing suites to re-run:** `workflow-engine`, `leave-workflow`.
- **Rollback:** in the file header (policy, then `workflow_instance_visible`, then drop the new function).

## 0241 — the Owner can turn a staff login off and on (#688)

- **Decisions taken:** nothing is deleted (auth user, profile, grants and employee link all stay, so "on" restores the same access). Archiving does not disable the login by itself in the database: the archive confirmation offers it, ticked by default, to the Owner. Un-archiving does **not** re-enable the login; the app says so and points to the Staff page.
- **What:** `profiles.login_disabled_at` (nullable, CHECK: staff_user rows only) and `set_staff_login_disabled(p_staff, p_disabled)` — Owner of that School only. Off = `auth.users.banned_until` 100 years ahead + that user's sessions, refresh tokens and one-time tokens removed + the timestamp. On = both cleared.
- **Pre-check:** (1) column and function not present yet; (2) `owner_manages_staff`, `record_audit`, `auth.sessions`, `auth.refresh_tokens`, `auth.one_time_tokens` exist; (3) logins whose Employee is archived (Test School A has one, #686); (4) no Staff User is already banned by hand.
- **Expected change per role:** Owner gains the switch (Staff page, staff detail, archive confirmation). Everyone else: nothing until an Owner disables that one login. The Owner cannot be disabled.
- **Before it is applied:** the switch is hidden and archiving shows today's warning and link.
- **NOT VERIFIED — check on the branch database:** that this project's auth server refuses a banned user at sign-in and refresh, and that `getUser()` fails once the session row is gone. The integration test asserts both.
- **Known limit:** an access token issued before the switch works at the API until it expires (project JWT lifetime, 1 hour by default). 0242 closes it.
- **Rollback:** un-ban every login the feature disabled, then drop the function, the CHECK and the column (exact SQL in the header).

## 0242 — a disabled staff login has no School (optional, second lock)

- **What:** one added condition in `app_current_school_id()`: `and login_disabled_at is null`.
- **Why it is separate:** it redefines the helper every tenant policy calls. Read the header before applying. It only bites rows with `login_disabled_at` set; only 0241's function sets that, only on `staff_user` rows, and 0241's CHECK forbids it on any other role — a School Owner can never be affected.
- **Pre-check:** (1) 0241 applied; (2) **the live function body is exactly 0131's** — if not, stop; (3) its grants, to compare afterwards; (4) who is disabled right now.
- **Expected change per role:** none for any enabled login. A disabled login reads nothing and writes nothing at once, also with an old token.
- **Rollback:** re-create 0131's definition (in the header).

## #697 — no migration

Unknown `/school/...` addresses stay refused by the proxy (fail closed, #515).
The refusal page already shows "page not found" for them. A real HTTP 404 would
mean letting unregistered segments past the proxy, or changing the proxy's
redirect to a rewrite; neither was done. Recommendation: close #697. Reason: the
routes are behind sign-in, so no crawler or uptime check sees the soft 404, and
the fail-closed rule is worth more than the status code.

## Database needs found while doing this, NOT in these files

1. **Archiving an employee widens their login's access.** `app_current_employee_id()` (0138) ignores an archived `employees` row, so an archived teacher's login counts as office staff: ADR 0021 then gives it the whole School's students, and 0240 lets it write the employee attendance tables. 0241 (disable on archive) is the mitigation, but only when the Owner ticks it. A fix in the function (keep the archived row as the signal, or return no reach) changes behaviour for every archived-but-active login and needs a decision.
2. **A staff user who archives an employee cannot disable the login.** Only the Owner can; for other archivers the login stays on and shows on the Staff list as "Employee archived".
3. **The two copies of a roll drift.** The edit form writes `students.roll_number` only, never the Enrollment's roll. One source of truth (or an RPC that writes both) would remove the need for 0244's double check.
4. **The edit form may blank `students.class_name` / `section`** when the Student's class is not in the year-filtered class list (not confirmed in a browser). That is also how the class-text index goes silent.
5. **`employee_leaves` and employee attendance rows** are not narrowed in RLS for teachers (see 0240).
6. Index items 6.1 (mobile format CHECK) and 6.2 (name length CHECK) were not written: they belong to no issue in this group and 6.1 needs a data clean-up first.
