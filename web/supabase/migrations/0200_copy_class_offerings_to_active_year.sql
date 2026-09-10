-- 0200_copy_class_offerings_to_active_year.sql
-- Wayfinder map #609, ticket #616 (T7). Builds on school_academic_years
-- (0199, #610), start_academic_year (0194, #594) and the widened
-- class_offerings_identity_unique (0190, #593).
--
-- The "Copy Classes from {year}" named domain action: clone a started prior
-- Academic Year's Class Offerings forward into the School's current
-- active_academic_year, so a School rolling into a new year does not have to
-- re-enter every Class/section by hand. Deliberately narrow -- it copies
-- ONLY the Offering-intrinsic shape (name, section, shift, group department,
-- education level) and nothing relational: no students, enrollments, class
-- teachers, routines, subjects, exams, fees, notices or homework. Carrying
-- any of those forward is a separate decision (#609 "Out of scope").
--
-- Atomic, idempotent, concurrency-safe:
--   * one `for update` lock on the school row -- the same lock
--     start_academic_year (0194) takes -- serializes two concurrent copies
--     for one School, so `copied`/`skipped` can never double-count.
--   * `on conflict on constraint class_offerings_identity_unique do nothing`
--     -- a re-run, or a copy that overlaps Offerings already created by hand
--     in the active year, inserts nothing for those rows and reports them as
--     `skipped`. Running it twice is safe; the second run returns
--     `copied = 0`.
--   * class_teacher_id is never in the column list: copies land unstaffed,
--     per-year staffing being its own decision.
--
-- School Owner only, checked inline (matching start_academic_year's literal
-- check). Never mutates the source rows and never touches
-- schools.active_academic_year -- the copy is not a year transition, only a
-- bulk create under the year the School is already on.

create function public.copy_class_offerings_to_active_year(p_source_year int)
returns table(copied int, skipped int)
language plpgsql security definer set search_path = public as $$
declare
  v_school schools%rowtype;
  v_source_count int;
  v_copied int;
begin
  select * into v_school
  from schools
  where id = public.app_current_school_id()
  for update;
  if not found then
    raise exception 'school not accessible';
  end if;

  if public.app_current_role() is distinct from 'school_owner' then
    raise exception 'not authorized -- School Owner only';
  end if;

  if v_school.active_academic_year is null then
    raise exception 'no active academic year set';
  end if;

  if not exists (
    select 1 from school_academic_years
    where school_id = v_school.id and academic_year = p_source_year
  ) then
    raise exception 'source year % was never started', p_source_year;
  end if;

  if p_source_year >= v_school.active_academic_year then
    raise exception 'source year must be older than the active academic year (%)',
      v_school.active_academic_year;
  end if;

  select count(*) into v_source_count
  from class_offerings
  where school_id = v_school.id and academic_year = p_source_year;

  with ins as (
    insert into class_offerings (
      school_id, name, section, shift, group_department, education_level, academic_year
    )
    select school_id, name, section, shift, group_department, education_level,
           v_school.active_academic_year
    from class_offerings
    where school_id = v_school.id and academic_year = p_source_year
    on conflict on constraint class_offerings_identity_unique do nothing
    returning 1
  )
  select count(*) into v_copied from ins;

  copied := v_copied;
  skipped := v_source_count - v_copied;

  -- Same generic 'school'/'configure' audit lane year transitions use (#594);
  -- before/after carry the source year and the resulting counts.
  perform public.record_audit(
    'school', v_school.id::text, 'configure',
    v_school.id, null,
    jsonb_build_object('copy_class_offerings_from', p_source_year),
    jsonb_build_object('copied', v_copied, 'skipped', v_source_count - v_copied)
  );

  return next;
  return;
end;
$$;

revoke execute on function public.copy_class_offerings_to_active_year(int) from anon, public;
grant execute on function public.copy_class_offerings_to_active_year(int) to authenticated;

comment on function public.copy_class_offerings_to_active_year(int) is
  'The "Copy Classes from year N" named domain action (issue #609, ticket '
  '#616): clones a started prior Academic Year''s Class Offerings into the '
  'calling School''s active_academic_year (School Owner only). Copies only '
  'Offering-intrinsic fields -- name, section, shift, group_department, '
  'education_level -- leaving class_teacher_id null; never copies students, '
  'enrollments, routines, subjects, exams, fees or any other relational '
  'data. Atomic (for update on the school row), idempotent and '
  'concurrency-safe via class_offerings_identity_unique + on conflict do '
  'nothing. Returns the actual copied / skipped counts. Never mutates source '
  'rows or schools.active_academic_year.';
