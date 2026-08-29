-- 0163_the_class_scope_answer_lives_in_one_place.sql
-- Map #524 / ticket #525 follow-up, found in architecture review of 0160.
--
-- 0160 narrowed every student-shaped read to the caller's class attachment, and
-- the students screen has to explain an empty list: office staff seeing nothing
-- means the school is empty, an Employee seeing nothing means nobody has assigned
-- them a class. `lib/school/class-scope.ts` answered that in TypeScript by
-- querying `employees` and `routine_slots` directly.
--
-- It cannot. Both tables are grant-gated: `employees` SELECT needs
-- app_module_granted('employees') and `routine_slots` needs the `classes` grant
-- (0136). A Class Teacher holding neither — the exact user the helper exists for —
-- gets an empty result rather than an error, so the code concluded "no employees
-- row, therefore office staff, therefore the whole school", and rendered
-- "No students yet" to a teacher whose class is full. That is precisely the lie
-- ADR 0021 says must never appear, reintroduced by the code written to prevent it.
--
-- It was also a second copy of a walk that already existed twice in SQL
-- (staff_class_capacity_for_student and staff_reaches_any_class, both 0152).
--
-- One definer function, one round trip, one place the rule lives.
create or replace function public.app_class_scope()
returns text
language sql stable security definer set search_path = public as $$
  select case
    -- Not a school member at all (Students included: 0131 makes
    -- app_current_school_id() null for them).
    when public.app_current_school_id() is null then 'none'
    -- The Owner is never narrowed.
    when public.app_current_role() = 'school_owner' then 'school-wide'
    -- No employees row is this codebase's definition of office staff (0152), and
    -- 0160 leaves them the whole school.
    when public.app_current_employee_id() is null then 'school-wide'
    -- An Employee: narrowed either way, but 'attached' means the empty list is
    -- genuinely empty while 'none' means nobody has given them a class yet.
    when public.staff_reaches_any_class() then 'attached'
    else 'none'
  end
$$;

comment on function public.app_class_scope() is
  'Why the caller''s student list is empty: school-wide (Owner or office staff), attached (has classes, list genuinely empty), none (an Employee nobody has assigned). Ticket #525 — must be a definer function, because employees and routine_slots are themselves grant-gated and a caller cannot read their own attachment.';

-- ---------------------------------------------------------------------------
-- 2. The capacity walk, addressed by CLASS rather than by student.
--
-- 0160's WITH CHECK called staff_class_capacity_for_student(id), which looks the
-- Student up by id and therefore reads the COMMITTED row. On UPDATE that is the
-- row as it was before the statement, so the check re-asked the question USING
-- had already answered and always agreed: a Class Teacher could
-- `update students set class_name = '6-B'` and move a child into a class she does
-- not hold — stranding them somewhere she can then neither see nor undo.
--
-- 0160's comment reasoned only about INSERT ("the row does not exist yet") and
-- missed that the same call is wrong on UPDATE for the opposite reason.
--
-- This variant takes the class coordinates instead, so WITH CHECK can be given
-- the NEW row's own school_id/class_name/section.
create or replace function public.staff_capacity_for_class(p_school uuid, p_class text, p_section text)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.app_current_school_id() is null then null
    when public.app_current_role() = 'school_owner'
      then case when p_school = public.app_current_school_id() then 'owner' end
    when public.app_current_employee_id() is null then null
    else (
      -- Aggregated across every matching class row, as 0152 §1 explains: classes
      -- carries no uniqueness on (school_id, name, section), so `limit 1` would
      -- let the planner decide whether a teacher may act on her own class.
      select case
               when bool_or(c.class_teacher_id = public.app_current_employee_id()) then 'class_teacher'
               when bool_or(exists (
                      select 1 from routine_slots r
                       where r.class_id = c.id and r.teacher_id = public.app_current_employee_id()
                    )) then 'subject_teacher'
             end
        from classes c
       where c.school_id = p_school
         and c.name = p_class
         and coalesce(c.section, '') = coalesce(p_section, '')
    )
  end
$$;

-- ---------------------------------------------------------------------------
-- 3. students — reading and deciding are different questions.
--
-- ADR 0021 gives a Subject Teacher the students of classes he teaches so he can
-- teach them, and says he "decides nothing" about them. 0160 wrote both halves as
-- `capacity is not null`, which is true for 'subject_teacher' — so he could
-- archive a child, and the UAT finding about behaviour-log controls on another
-- class's student was only half closed.
--
-- Split: SELECT takes any capacity; writing takes owner or class_teacher, and
-- checks the NEW row's class rather than the old one.
drop policy if exists "school members manage students" on public.students;

create policy "school members read students" on public.students
  for select
  using (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(id) is not null
    )
  );

create policy "school members write students" on public.students
  for all
  using (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(id) in ('owner', 'class_teacher')
    )
  )
  with check (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_capacity_for_class(school_id, class_name, section) in ('owner', 'class_teacher')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. student_subjects — same split, same reason.
--
-- Assigning a child's subjects is deciding about the child, so it is class
-- teacher work. The WITH CHECK term resolves the class through the student being
-- written, which is the row this table points at.
drop policy if exists "school members manage student_subjects" on public.student_subjects;

create policy "school members read student_subjects" on public.student_subjects
  for select
  using (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(student_id) is not null
    )
  );

create policy "school members write student_subjects" on public.student_subjects
  for all
  using (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(student_id) in ('owner', 'class_teacher')
    )
  )
  with check (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(student_id) in ('owner', 'class_teacher')
    )
  );

-- ---------------------------------------------------------------------------
-- 5. behaviour_log_entries — a Subject Teacher does not write a child's record.
drop policy if exists "school members manage behaviour log" on public.behaviour_log_entries;

create policy "school members manage behaviour log" on public.behaviour_log_entries
  for all
  using (
    public.staff_class_capacity_for_student(student_id) in ('owner', 'class_teacher')
    and (
      (select public.app_module_granted('students'))
      or (select public.app_module_granted('exams'))
    )
  )
  with check (
    public.staff_class_capacity_for_student(student_id) in ('owner', 'class_teacher')
    and (
      (select public.app_module_granted('students'))
      or (select public.app_module_granted('exams'))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. classes — restore the Owner.
--
-- 0160 wrote the write policy as "no employees row", reading that as "office
-- staff or Owner". It is not: an Owner who also carries an employees row —
-- owner-as-principal, which this product does not forbid — lost INSERT, UPDATE
-- and DELETE on their own catalogue. The students policy never had this bug
-- because its capacity walk answers 'owner' regardless of class; this one had no
-- equivalent branch. No Owner on the shared database has an employees row today,
-- so nothing was broken in practice — it was waiting for the first one.
drop policy if exists "school members write classes" on public.classes;

create policy "school members write classes" on public.classes
  for all
  using (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_role()) = 'school_owner'
      or (select public.app_current_employee_id()) is null
    )
  )
  with check (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_role()) = 'school_owner'
      or (select public.app_current_employee_id()) is null
    )
  );

-- ---------------------------------------------------------------------------
-- 7. gl_is_balanced is a definer function and should not be callable by anyone
--    who happens to be authenticated, matching its siblings in 0085.
revoke all on function public.gl_is_balanced() from public;
grant execute on function public.gl_is_balanced() to authenticated;
revoke all on function public.app_class_scope() from public;
grant execute on function public.app_class_scope() to authenticated;
