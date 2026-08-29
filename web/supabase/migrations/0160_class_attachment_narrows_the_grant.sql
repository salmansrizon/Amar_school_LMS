-- 0160_class_attachment_narrows_the_grant.sql
-- Map #524 / ticket #525: a class attachment NARROWS a Permission Grant.
--
-- ADR 0018 gave a Staff User two axes and 0152 enforced them on the two
-- student-facing queues. It never said what happens when both axes are present
-- and disagree — so `students` kept 0024's `school_id = app_current_school_id()`
-- and a Class Teacher holding the `students` grant read the whole school. On
-- staging that is 82 children across 39 class/section combinations for a teacher
-- assigned to one class. Tenant isolation held; the reach did not.
--
-- The rule this migration adds:
--
--   Caller                        | students rows
--   ------------------------------+-----------------------------------------
--   School Owner                  | the whole school
--   Staff with no employees row   | the whole school — this is office staff,
--     (the office login)          | and there is nothing to narrow by
--   Class Teacher                 | students of classes she is class teacher of
--   Subject Teacher               | students of classes he appears in the
--                                 | routine for
--   Both hats                     | the union of his own attachments, never a
--                                 | widening back to school-wide
--   Employee with no attachment   | NOTHING
--
-- Failure mode is LESS access: an Employee is narrowed even where a Grant would
-- have said yes, because the Owner assigning Karim Sir to 6-A has already said
-- what they mean and a permissions screen is only a second chance to get it
-- wrong.
--
-- The signal is the EMPLOYEES ROW, not the attachment. Keying on the attachment
-- was the obvious choice and it is wrong: a teacher who has been given a class
-- but not yet put on the routine would have no attachment, become
-- indistinguishable from a clerk, and receive the whole school — reintroducing
-- the exact silent footgun ADR 0018 was written to kill. `employees.profile_id`
-- is already this codebase's definition of who is not office staff (0152 says so
-- in as many words), so this reuses that seam rather than inventing a second one.
--
-- The cost, named rather than discovered: an Employee with no attachment at all
-- now reads no students. That is deliberate — it is ADR 0018's "neither" bucket —
-- but it must never present as a blank screen. The screens say `No class
-- assigned` and point at the Owner (#525's app half).
--
-- Deliberately NOT added: an `app_module_granted('students')` term. The students
-- table is read by attendance, fees, exams, SMS and search, and office staff hold
-- those grants without holding `students`. Requiring it here would break the
-- roster for a clerk granted `attendance` only — a wider blast radius than the
-- defect. Screen access stays the proxy's job (ADR 0020); this migration decides
-- which rows, not which screens.
--
-- Additive only — staging and main share one project.

-- ---------------------------------------------------------------------------
-- 1. students — the row set itself.
--
-- One policy for ALL, not four: it is the same question for reading and for
-- acting, and four copies of one rule drift in three of them.
--
-- `app_current_employee_id()` is zero-argument and constant across the scan, so
-- it is wrapped `(select ...)` and the planner hoists it into an InitPlan —
-- evaluated once per query rather than once per row. `staff_class_capacity_for_student`
-- takes the row's own id and cannot be hoisted, so it is deliberately left bare;
-- 0150 §2 and 0152 §1 both drew that line.
--
-- A School Owner satisfies this two ways over — no employees row on most, and
-- the capacity walk returns 'owner' regardless of class on any who has one.
--
-- WITH CHECK has a consequence worth naming. On INSERT the row does not exist
-- yet, so the capacity walk finds nothing and returns null, which denies
-- admission to any Employee. The Owner and office staff are unaffected, because
-- their branch never consults it. That is the right answer: admitting a child is
-- Owner and office work, and a Class Teacher creating students in her own class
-- was never a workflow this product offers.
drop policy if exists "school members manage students" on public.students;

create policy "school members manage students" on public.students
  for all
  using (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(id) is not null
    )
  )
  with check (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(id) is not null
    )
  );

-- ---------------------------------------------------------------------------
-- 2. behaviour_log_entries — a record ABOUT a child.
--
-- The 0024-era predicate was student_in_my_school(), i.e. school-wide, gated only
-- on holding either the students or the exams grant. The UAT pass opened an
-- unrelated student's detail page as a Class Teacher and found the behaviour-log
-- control live.
--
-- The grant term stays and is doing real work here: this table is not read by
-- attendance or fees, so tightening it strands nobody. Only the school-wide half
-- is replaced.
drop policy if exists "school members manage behaviour log" on public.behaviour_log_entries;

create policy "school members manage behaviour log" on public.behaviour_log_entries
  for all
  using (
    public.staff_class_capacity_for_student(student_id) is not null
    and (
      (select public.app_module_granted('students'))
      or (select public.app_module_granted('exams'))
    )
  )
  with check (
    public.staff_class_capacity_for_student(student_id) is not null
    and (
      (select public.app_module_granted('students'))
      or (select public.app_module_granted('exams'))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. student_subjects — which subjects a child takes.
--
-- Same shape as students. The UAT pass found subject assignment reachable for
-- another class's student from the same detail page.
drop policy if exists "school members manage student_subjects" on public.student_subjects;

create policy "school members manage student_subjects" on public.student_subjects
  for all
  using (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(student_id) is not null
    )
  )
  with check (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(student_id) is not null
    )
  );

-- ---------------------------------------------------------------------------
-- 4. classes — reading stays school-wide, writing does not.
--
-- Every class picker in the product reads this table, and a Class Teacher needs
-- to see the catalogue to use one. Narrowing SELECT would break twelve selectors
-- to fix nothing: a class NAME is not a child's record.
--
-- Writing is the actual finding. The UAT pass reached /school/classes as a Class
-- Teacher and found destructive subject/class controls live — school catalogue
-- deletion authority acquired merely by being assigned a class to teach. Writes
-- now require the absence of an employees row, leaving them with the Owner and
-- with office staff holding the `classes` grant.
--
-- Two policies, and RLS ORs them: the select policy alone answers SELECT, so
-- reads stay school-wide for everyone; the write policy is the only one covering
-- INSERT, UPDATE and DELETE.
drop policy if exists "school members manage classes" on public.classes;

create policy "school members read classes" on public.classes
  for select
  using (school_id = (select public.app_current_school_id()));

create policy "school members write classes" on public.classes
  for all
  using (
    school_id = (select public.app_current_school_id())
    and (select public.app_current_employee_id()) is null
  )
  with check (
    school_id = (select public.app_current_school_id())
    and (select public.app_current_employee_id()) is null
  );
