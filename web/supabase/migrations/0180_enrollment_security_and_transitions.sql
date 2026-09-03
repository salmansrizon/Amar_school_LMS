-- 0180_enrollment_security_and_transitions.sql
-- Wave 2 (issue #585) of the Flexible Academic Structure execution map
-- (#582), implementing #569's redesigned capacity primitives and #572's/
-- #573's/#574's enrollment-transition functions. Exact bodies specified in
-- full in each ticket's resolution comment; this migration transcribes them
-- verbatim (only reformatted for this file's own comment style).
--
-- Scope note on what this migration deliberately does NOT touch:
--
-- - `staff_capacity_for_class(p_school, p_class, p_section)` (the OLD 3-arg,
--   class-coordinate function) is left in place, untouched since Wave 1's
--   rename-only fix. #585's own item 1 calls staff_capacity_for_class_offering
--   its "replacement", but the only remaining caller of the old function is
--   the `students` table's own WRITE policy WITH CHECK (migration 0163),
--   which authorizes a DIRECT client UPDATE changing students.class_name/
--   section -- a path #569-#574 never propose retiring, and
--   class-attachment-scope.test.ts's "cannot move her own child into a class
--   she does not hold" case still exercises it directly. Neither the ticket's
--   itemized migration list nor #569's "Consumers requiring the equivalent
--   swap" section names the students write policy as something this wave
--   touches -- so it isn't touched. staff_capacity_for_class_offering is an
--   ADDITION for the new target-Offering-id call sites (the three transition
--   functions below), not a literal replacement requiring the old function's
--   removal.
-- - `staff_reaches_any_class()` / `app_class_scope()` need no change here:
--   #569's resolution says they need only "swapping their inner classes/
--   routine_slots join for the class_offerings/routine_slots shape" -- and
--   Wave 1 (migration 0174) already did exactly that (it was a pure rename
--   fix, and this function's join shape was never text-based to begin with --
--   it walks class_offerings.class_teacher_id / routine_slots.teacher_id
--   directly, the same shape #569 asks for). Nothing left to do.
-- - `student_in_class(p_school, p_class, p_section)` (backs the "student
--   reads own class offering" policy) takes its class/section as arguments
--   from the caller and never references classes/class_offerings itself --
--   confirmed clean, no action.
-- - The `class_offerings` write policy (migration 0163, item 7 in #585) was
--   verified live: it survived the rename with zero logic change (owner OR
--   no-employees-row, unchanged) -- policies are parse-tree stored, not text,
--   so a table rename propagates automatically. No SQL needed for item 7.
-- - `student_enrollments`/`employee_academic_shifts` read RLS (item 8) was
--   already established correctly in Wave 1 (migrations 0177/0179), each
--   already matching the sibling pattern #585 asks for. No change needed --
--   0177's read policy calls staff_class_capacity_for_student by name, so it
--   automatically inherits this migration's rewritten body with no edit of
--   its own required.

-- ---------------------------------------------------------------------------
-- 1. staff_capacity_for_class_offering(p_offering uuid) -- #569.
--
-- The target-Offering-id analog of staff_capacity_for_class, for every call
-- site that now has a real Class Offering id to check against instead of a
-- (school, class_name, section) coordinate triple. Authorization for a write
-- must always evaluate the TARGET Offering, never the student's existing
-- one -- the exact property that makes this safe to use inside the
-- transition functions below.
create or replace function public.staff_capacity_for_class_offering(p_offering uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.app_current_school_id() is null then null
    when public.app_current_role() = 'school_owner' then (
      select 'owner' from class_offerings co
       where co.id = p_offering and co.school_id = public.app_current_school_id()
    )
    when public.app_current_employee_id() is null then null
    else (
      select case
               when co.class_teacher_id = public.app_current_employee_id() then 'class_teacher'
               when exists (
                 select 1 from routine_slots r
                  where r.class_offering_id = co.id and r.teacher_id = public.app_current_employee_id()
               ) then 'subject_teacher'
             end
        from class_offerings co
       where co.id = p_offering and co.school_id = public.app_current_school_id()
    )
  end
$$;

revoke execute on function public.staff_capacity_for_class_offering(uuid) from anon, public;
grant execute on function public.staff_capacity_for_class_offering(uuid) to authenticated;
grant execute on function public.staff_capacity_for_class_offering(uuid) to service_role;

comment on function public.staff_capacity_for_class_offering(uuid) is
  'ADR 0021/#569: which capacity the caller holds over a TARGET Class Offering by id -- owner/class_teacher/subject_teacher/null. Used by every write that must authorize against the target of a transition, never the student''s pre-write Offering (map #568/#582).';

-- ---------------------------------------------------------------------------
-- 2. staff_class_capacity_for_student(p_student uuid), rewritten -- #569.
--
-- Replaces Wave 1's rename-only version (0174), which still matched
-- class_name/section by text. This version walks the real FK chain
-- students.current_enrollment_id -> student_enrollments -> class_offerings,
-- and drops the bool_or aggregation entirely -- a FK chain matches at most
-- one row by construction, so there is nothing left for it to defend
-- against (#569's resolution, "The capacity primitive, redesigned").
--
-- Consumers needing no change of their own: the students/student_subjects/
-- behaviour_log_entries/student_messages policies all call this function by
-- name (migrations 0152/0163), so redefining its body here propagates to
-- every one of them automatically.
--
-- CORRECTION vs. #569's resolution comment's verbatim SQL block: that text
-- omits a `co.school_id = s.school_id` join condition, even though #569's own
-- verification checklist (item 4) binds every redesigned function to retain
-- "school_id = app_current_school_id() ... at every step (on students, on
-- class_offerings)". Caught by this wave's own code review, not a redesign --
-- restores the guard the checklist itself requires, matching Wave 1's
-- rename-only version of this same function (0174) which had it. Defense in
-- depth alongside the admit_student_enrollment fix below, which is what could
-- otherwise let a cross-school class_offering_id reach an enrollment row.
create or replace function public.staff_class_capacity_for_student(p_student uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.app_current_school_id() is null then null
    when public.app_current_role() = 'school_owner' then (
      select 'owner' from students s
       where s.id = p_student and s.school_id = public.app_current_school_id()
    )
    when public.app_current_employee_id() is null then null
    else (
      select case
               when co.class_teacher_id = public.app_current_employee_id() then 'class_teacher'
               when exists (
                 select 1 from routine_slots r
                  where r.class_offering_id = co.id
                    and r.teacher_id = public.app_current_employee_id()
               ) then 'subject_teacher'
             end
        from students s
        join student_enrollments e on e.id = s.current_enrollment_id
        join class_offerings co on co.id = e.class_offering_id
       where s.id = p_student
         and s.school_id = public.app_current_school_id()
         and co.school_id = s.school_id
    )
  end
$$;

-- ---------------------------------------------------------------------------
-- 3. student_enrollments.outcome vocabulary -- #574. Reserved unconstrained
-- by Wave 1 (0177) deliberately; #574 owns the exact vocabulary.
alter table public.student_enrollments
  add constraint student_enrollments_outcome_valid check (
    outcome is null or outcome in ('promoted', 'repeated', 'transferred', 'left')
  );

-- Bounds check on class_offerings.academic_year -- caught by code review:
-- Wave 1 (0174) added this column with no CHECK, unlike every sibling
-- academic_year column in the schema (fee_structures.academic_year, 0039;
-- schools.active_academic_year, 0175) -- both `between 2000 and 2100`. Added
-- here rather than editing 0174 in place, since 0174 is already applied.
alter table public.class_offerings
  add constraint class_offerings_academic_year_valid check (
    academic_year is null or academic_year between 2000 and 2100
  );

-- ---------------------------------------------------------------------------
-- 4. Belt-and-suspenders consistency trigger -- #573's own suggested
-- defense-in-depth: a student's current_enrollment_id, if set, must point at
-- a student_enrollments row that itself belongs to that same student. This
-- is already structurally guaranteed by every write path below (each only
-- ever points the pointer at a row it just inserted for that exact student),
-- so this trigger should never fire in practice -- it exists to catch a
-- future write path that gets this wrong, cheaply, matching migration
-- 0155's own stated preference for pairing a structural guarantee with an
-- explicit check where the cost is low.
create or replace function public.enforce_student_current_enrollment_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.current_enrollment_id is not null and not exists (
    select 1 from student_enrollments
     where id = new.current_enrollment_id and student_id = new.id
  ) then
    raise exception 'current_enrollment_id must reference an enrollment belonging to this student';
  end if;
  return new;
end $$;

drop trigger if exists student_current_enrollment_consistency on public.students;
create trigger student_current_enrollment_consistency
  before insert or update of current_enrollment_id on public.students
  for each row execute function public.enforce_student_current_enrollment_consistency();

-- Caught by code review: the consistency trigger above only checks WHERE the
-- pointer points, not WHO may move it -- students' own write policy (0163)
-- places no restriction on which columns a Class Teacher (or anyone with
-- write capacity on the row) may change, so a direct
-- `.from('students').update({ current_enrollment_id: null })` bypassed every
-- transition primitive below entirely: it cleared the pointer without
-- closing the old enrollment row (leaving it permanently "open"), and a
-- following admit_student_enrollment call (whose only guard is
-- `current_enrollment_id is not null`) would then open a SECOND concurrently
-- current enrollment -- exactly the corruption this wave's own tests assert
-- can never happen, reachable with a single ordinary table write and no
-- concurrency at all.
--
-- Closed with a session-local guard: each of the three transition functions
-- below sets `app.enrollment_transition_in_progress` (via set_config's
-- is_local=true, so it always resets at the end of that one transaction) just
-- before writing the pointer; this trigger refuses any change the flag isn't
-- set for, regardless of who is making it or what RLS would otherwise allow.
create or replace function public.enforce_current_enrollment_id_via_transition_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.enrollment_transition_in_progress', true), '') = 'true' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.current_enrollment_id is not null then
      raise exception 'current_enrollment_id may only be set by admit_student_enrollment, set_student_enrollment, or close_student_enrollment';
    end if;
  elsif new.current_enrollment_id is distinct from old.current_enrollment_id then
    raise exception 'current_enrollment_id may only be changed by admit_student_enrollment, set_student_enrollment, or close_student_enrollment';
  end if;
  return new;
end $$;

drop trigger if exists student_current_enrollment_via_transition_only on public.students;
create trigger student_current_enrollment_via_transition_only
  before insert or update of current_enrollment_id on public.students
  for each row execute function public.enforce_current_enrollment_id_via_transition_only();

-- Caught by code review: student_enrollments.class_offering_id (0177) has a
-- plain FK with no same-school guard, unlike every other table referencing
-- class_offerings (routine_slots, fee_structures, exam_combinations, exams
-- all got an enforce_*_school trigger in 0174). Table-level defense in depth
-- alongside admit_student_enrollment's own explicit check below -- matches
-- the established codebase pattern exactly (mirrors enforce_fee_structure_school).
create or replace function public.enforce_student_enrollment_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from class_offerings where id = new.class_offering_id and school_id = new.school_id
  ) then
    raise exception 'class offering does not belong to this school';
  end if;
  if not exists (
    select 1 from students where id = new.student_id and school_id = new.school_id
  ) then
    raise exception 'student does not belong to this school';
  end if;
  return new;
end $$;

drop trigger if exists student_enrollment_same_school on public.student_enrollments;
create trigger student_enrollment_same_school
  before insert or update on public.student_enrollments
  for each row execute function public.enforce_student_enrollment_school();

-- ---------------------------------------------------------------------------
-- 5. set_student_enrollment -- #573. The sole sanctioned enrollment-
-- transition primitive (promotion/repeat/transfer -- #574's three outcomes
-- are all callers of this one function, differing only in
-- p_outcome_for_previous).
create or replace function public.set_student_enrollment(
  p_student_id uuid,
  p_class_offering_id uuid,
  p_roll_number int,
  p_outcome_for_previous text,
  p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_student students%rowtype;
  v_new_enrollment_id uuid;
  v_capacity text;
begin
  -- Lock the student row first, exactly like transfer_student's existing
  -- `for update` -- serializes concurrent transition attempts for the SAME
  -- student; a second concurrent call blocks here until the first commits,
  -- then re-reads the now-current state rather than racing it.
  select * into v_student from students where id = p_student_id for update;
  if not found then
    raise exception 'unknown student';
  end if;
  if v_student.school_id is distinct from public.app_current_school_id() then
    raise exception 'student not accessible';
  end if;

  -- Explicit authorization check: security definer bypasses RLS on this
  -- function's own writes, so this cannot be left to a WITH CHECK clause --
  -- it must be checked inline, exactly as transfer_student already does for
  -- school-scoping. Evaluated against the TARGET Offering (#569's binding
  -- requirement), never the student's existing one.
  -- `not in (...)` on a possibly-NULL v_capacity is a classic three-valued-logic
  -- trap: NULL NOT IN (...) evaluates to NULL, and plpgsql's IF treats NULL as
  -- false, so an actor with NO capacity at all (v_capacity is null) would
  -- silently fall through the check unauthorized -- confirmed empirically by
  -- this wave's own test suite (#585). Written to reject null explicitly.
  v_capacity := public.staff_capacity_for_class_offering(p_class_offering_id);
  if v_capacity is null or v_capacity not in ('owner', 'class_teacher') then
    raise exception 'not authorized for the target class offering';
  end if;

  -- Close the previous current Enrollment, if any, before creating the new
  -- one -- both in this one transaction, so a crash between the two cannot
  -- happen; either the whole function commits or none of it does.
  --
  -- Caught by code review: `outcome` here must be one of the three outcomes
  -- this function actually owns (#574: "Promoted, Repeated, Transferred --
  -- all set_student_enrollment calls"). 'left' is close_student_enrollment's
  -- exclusive concern -- without this check a caller could close the
  -- previous enrollment as 'left' while simultaneously opening a new CURRENT
  -- one, leaving the student both "left" in history and actively enrolled.
  -- `is null or ... not in` guards the same three-valued-logic trap as the
  -- capacity check above (a bare `not in` on NULL would silently pass).
  if v_student.current_enrollment_id is not null then
    if p_outcome_for_previous is null or p_outcome_for_previous not in ('promoted', 'repeated', 'transferred') then
      raise exception 'invalid outcome for set_student_enrollment — use promoted, repeated, or transferred (leaving must go through close_student_enrollment)';
    end if;
    update student_enrollments
    set closed_at = now(), outcome = p_outcome_for_previous
    where id = v_student.current_enrollment_id;
  end if;

  insert into student_enrollments (school_id, student_id, class_offering_id, roll_number, note)
  values (v_student.school_id, p_student_id, p_class_offering_id, p_roll_number, p_note)
  returning id into v_new_enrollment_id;

  -- The pointer always targets the row this function itself just inserted
  -- for this exact student -- never an externally-supplied enrollment id --
  -- so it structurally cannot be made to point at another student's row.
  -- The local GUC lets the via-transition-only trigger recognize this as a
  -- sanctioned write; it resets automatically at the end of this transaction.
  perform set_config('app.enrollment_transition_in_progress', 'true', true);
  update students set current_enrollment_id = v_new_enrollment_id where id = p_student_id;

  return v_new_enrollment_id;
end $$;

revoke execute on function public.set_student_enrollment(uuid, uuid, int, text, text) from anon, public;
grant execute on function public.set_student_enrollment(uuid, uuid, int, text, text) to authenticated;
grant execute on function public.set_student_enrollment(uuid, uuid, int, text, text) to service_role;

comment on function public.set_student_enrollment(uuid, uuid, int, text, text) is
  'Sole sanctioned enrollment-transition primitive (#573, map #568/#582): promotion/repeat/transfer (#574) all call this, differing only in p_outcome_for_previous. Authorizes against the TARGET class_offering_id, row-locks the student, atomically closes the previous current enrollment and creates/repoints the new one.';

-- ---------------------------------------------------------------------------
-- 6. admit_student_enrollment -- #572. Admission's own, deliberately
-- NARROWER primitive -- Owner/office-staff only (ADR 0021: "An Employee
-- cannot admit a student"), never reusing set_student_enrollment's broader
-- owner-or-class_teacher check.
create or replace function public.admit_student_enrollment(
  p_student_id uuid,
  p_class_offering_id uuid,
  p_roll_number int,
  p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_student students%rowtype;
  v_new_enrollment_id uuid;
begin
  select * into v_student from students where id = p_student_id for update;
  if not found then
    raise exception 'unknown student';
  end if;
  if v_student.school_id is distinct from public.app_current_school_id() then
    raise exception 'student not accessible';
  end if;
  if v_student.current_enrollment_id is not null then
    raise exception 'student already has a current enrollment — use set_student_enrollment instead';
  end if;

  -- Admission authorization: Owner or office staff (no employees row) ONLY --
  -- ADR 0021's explicit rule, deliberately narrower than
  -- set_student_enrollment's owner-or-class_teacher check. Same idiom
  -- migration 0163 already uses for the class_offerings write policy.
  if not (
    public.app_current_role() = 'school_owner'
    or public.app_current_employee_id() is null
  ) then
    raise exception 'not authorized to admit students';
  end if;

  -- Caught by code review: unlike set_student_enrollment/close_student_enrollment
  -- (both gated through staff_capacity_for_class_offering, which itself checks
  -- `co.school_id = app_current_school_id()`), this function never queried
  -- class_offerings at all -- an Owner/office-staff caller could admit a real
  -- own-school student into an OTHER school's class_offerings.id, since the
  -- role-only check above says nothing about the target Offering's tenant.
  -- The enforce_student_enrollment_school trigger below would also now catch
  -- this at the table level; checked explicitly here too so the error names
  -- the actual problem rather than a generic trigger message.
  if not exists (
    select 1 from class_offerings where id = p_class_offering_id and school_id = v_student.school_id
  ) then
    raise exception 'class offering does not belong to this school';
  end if;

  insert into student_enrollments (school_id, student_id, class_offering_id, roll_number, note)
  values (v_student.school_id, p_student_id, p_class_offering_id, p_roll_number, p_note)
  returning id into v_new_enrollment_id;

  perform set_config('app.enrollment_transition_in_progress', 'true', true);
  update students set current_enrollment_id = v_new_enrollment_id where id = p_student_id;
  return v_new_enrollment_id;
end $$;

revoke execute on function public.admit_student_enrollment(uuid, uuid, int, text) from anon, public;
grant execute on function public.admit_student_enrollment(uuid, uuid, int, text) to authenticated;
grant execute on function public.admit_student_enrollment(uuid, uuid, int, text) to service_role;

comment on function public.admit_student_enrollment(uuid, uuid, int, text) is
  'The Admission-only enrollment primitive (#572, map #568/#582): Owner/office-staff only (ADR 0021 — a Class Teacher cannot admit), deliberately narrower than set_student_enrollment. Refuses a student who already has a current enrollment.';

-- ---------------------------------------------------------------------------
-- 7. close_student_enrollment -- #574. The Leaving primitive: no target
-- Offering exists for Leaving, so authorization checks the CLOSING (current)
-- Offering instead.
create or replace function public.close_student_enrollment(
  p_student_id uuid,
  p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student students%rowtype;
  v_offering_id uuid;
  v_capacity text;
begin
  select * into v_student from students where id = p_student_id for update;
  if not found then
    raise exception 'unknown student';
  end if;
  if v_student.school_id is distinct from public.app_current_school_id() then
    raise exception 'student not accessible';
  end if;
  if v_student.current_enrollment_id is null then
    raise exception 'student has no current enrollment to close';
  end if;

  -- No target Offering exists for Leaving -- the check is against the
  -- CLOSING Offering (the student's current one), the only Offering this
  -- operation actually touches.
  select class_offering_id into strict v_offering_id
    from student_enrollments where id = v_student.current_enrollment_id;
  -- Same NULL-handling correction as set_student_enrollment above -- `not in`
  -- on a NULL v_capacity would otherwise silently authorize an actor with no
  -- capacity at all.
  v_capacity := public.staff_capacity_for_class_offering(v_offering_id);
  if v_capacity is null or v_capacity not in ('owner', 'class_teacher') then
    raise exception 'not authorized for the closing class offering';
  end if;

  update student_enrollments
  set closed_at = now(), outcome = 'left', note = p_note
  where id = v_student.current_enrollment_id;

  perform set_config('app.enrollment_transition_in_progress', 'true', true);
  update students set current_enrollment_id = null where id = p_student_id;
end $$;

revoke execute on function public.close_student_enrollment(uuid, text) from anon, public;
grant execute on function public.close_student_enrollment(uuid, text) to authenticated;
grant execute on function public.close_student_enrollment(uuid, text) to service_role;

comment on function public.close_student_enrollment(uuid, text) is
  'The Leaving enrollment primitive (#574, map #568/#582): closes the student''s current enrollment with outcome=left and clears current_enrollment_id. Authorizes against the CLOSING (current) Offering, since Leaving has no target. Conceptually separate from archiveStudent() — neither call implies the other.';
