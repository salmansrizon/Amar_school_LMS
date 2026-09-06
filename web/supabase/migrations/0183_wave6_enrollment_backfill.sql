-- 0183_wave6_enrollment_backfill.sql
-- Wave 6 (issue #591), implementing #575's resolution, item 3.
--
-- Bulk-admits every currently-unenrolled Student whose class_name/section
-- resolves to exactly one Class Offering in their own School, mirroring
-- web/lib/school/roster.ts's rosterFor() -- the app's own live resolution
-- rule, already running today via the compat bridge -- exactly: case-
-- sensitive equality on both class_name and section (coalesced to '' so a
-- sectionless Student matches a sectionless Offering). A Student who
-- doesn't resolve keeps current_enrollment_id null -- a valid, visible-to-
-- Owner state per #569, not an error.
--
-- admit_student_enrollment() itself can't be called from here: it resolves
-- app_current_school_id()/app_current_role()/app_current_employee_id() from
-- the CALLING SESSION's auth.uid(), and a migration has no session at all --
-- every one of those would return null and the RPC's own authorization
-- checks would reject every row. This replicates its data-integrity core
-- (the GUC-gated insert + current_enrollment_id update) without its per-
-- request authorization checks, which don't apply here: a migration acts
-- with unconditional admin authority over its own School data by
-- construction, the same way every other migration in this map already has.
--
-- Anomaly guard, per #575's binding "fail on an anomaly, don't guess"
-- requirement: aborts entirely if any resolvable Student matches more than
-- one Class Offering in their School. Should be structurally impossible --
-- class_offerings_school_name_section_unique already forbids two Offerings
-- sharing a school_id+name+section -- but asserted rather than assumed.
do $$
declare
  v_ambiguous_count int;
  v_row record;
  v_enrollment_id uuid;
begin
  select count(*) into v_ambiguous_count
  from (
    select s.id
    from public.students s
    join public.class_offerings co
      on co.school_id = s.school_id
     and co.name = s.class_name
     and coalesce(co.section, '') = coalesce(s.section, '')
    where s.current_enrollment_id is null
    group by s.id
    having count(*) > 1
  ) ambiguous;

  if v_ambiguous_count > 0 then
    raise exception 'Wave 6 backfill: % student(s) resolve to more than one Class Offering in their School -- expected the unique index to make this impossible. Aborting rather than guessing.', v_ambiguous_count;
  end if;

  -- Preserve each Student's roll_number exactly as it stands today,
  -- including null -- assign_enrollment_roll (0181) auto-assigns a fresh
  -- roll whenever NEW.roll_number is null, which would fabricate a roll a
  -- Student never actually had. Disabled only for this bulk insert, and
  -- guaranteed to be re-enabled even if the loop below raises, so a failed
  -- run never leaves live-roster-affecting behavior silently disabled.
  execute 'alter table public.student_enrollments disable trigger student_enrollment_assign_roll';

  begin
    for v_row in
      select s.id as student_id, s.school_id, s.roll_number, co.id as class_offering_id
      from public.students s
      join public.class_offerings co
        on co.school_id = s.school_id
       and co.name = s.class_name
       and coalesce(co.section, '') = coalesce(s.section, '')
      where s.current_enrollment_id is null
    loop
      perform set_config('app.enrollment_transition_in_progress', 'true', true);
      insert into public.student_enrollments (school_id, student_id, class_offering_id, roll_number, note)
      values (v_row.school_id, v_row.student_id, v_row.class_offering_id, v_row.roll_number, 'Wave 6 backfill (#591)')
      returning id into v_enrollment_id;

      update public.students set current_enrollment_id = v_enrollment_id where id = v_row.student_id;
    end loop;
  exception when others then
    execute 'alter table public.student_enrollments enable trigger student_enrollment_assign_roll';
    raise;
  end;

  execute 'alter table public.student_enrollments enable trigger student_enrollment_assign_roll';
end $$;
