-- 0204_copy_subjects_to_class.sql
-- Issue #642: "Copy Classes from year" (0200) deliberately never carried
-- Subjects forward -- its own comment named that as a separate decision
-- (#609 "Out of scope"). This is that decision, but scoped narrower: copy
-- one or more Subjects from wherever they live today into one other Class
-- Offering, on demand from the Subject List.
--
-- Same shape as copy_class_offerings_to_active_year: atomic, idempotent,
-- returns {copied, skipped}. Two differences from that RPC, both
-- deliberate:
--   * No School-Owner gate. Copying a Subject is the same authority level
--     as adding one by hand (RLS "school members manage subjects"/
--     addSubject has no role check either) -- unlike copying Class
--     Offerings across years, which is a rarer, structural, cross-year
--     decision this codebase reserves for the Owner.
--   * Conflict arbiter is subjects_unique_per_class's own expression list
--     (school_id, class_id, lower(name)) rather than a named constraint --
--     0165 created it as a plain unique index, not a table constraint, so
--     `on conflict on constraint ...` is not available here.
--
-- Duplicate, never move: source rows are never touched, and a Subject
-- already present on the target Class (by name, case-insensitive) is
-- skipped rather than overwritten -- copying can never silently change a
-- Subject's existing mark configuration on the target Class.

create function public.copy_subjects_to_class(p_subject_ids uuid[], p_target_class_id uuid)
returns table(copied int, skipped int)
language plpgsql security definer set search_path = public as $$
declare
  v_school_id uuid := public.app_current_school_id();
  v_source_count int;
  v_copied int;
begin
  if v_school_id is null then
    raise exception 'school not accessible';
  end if;

  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'no subjects selected';
  end if;

  -- Target must be this School's own, non-archived Class Offering (ADR
  -- 0024's "archived drops out of every screen that picks a Class Offering
  -- for new forward-looking use" -- copying Subjects onto one is exactly
  -- that).
  if not exists (
    select 1 from class_offerings
    where id = p_target_class_id and school_id = v_school_id and archived_at is null
  ) then
    raise exception 'target class not accessible or archived';
  end if;

  select count(*) into v_source_count
  from subjects
  where id = any(p_subject_ids) and school_id = v_school_id;

  with ins as (
    insert into subjects (school_id, class_id, name, code, theory_marks, mcq_marks, practical_marks, paper_count)
    select school_id, p_target_class_id, name, code, theory_marks, mcq_marks, practical_marks, paper_count
    from subjects
    where id = any(p_subject_ids) and school_id = v_school_id
    on conflict (school_id, class_id, lower(name)) do nothing
    returning 1
  )
  select count(*) into v_copied from ins;

  copied := v_copied;
  skipped := v_source_count - v_copied;
  return next;
  return;
end $$;

revoke execute on function public.copy_subjects_to_class(uuid[], uuid) from anon, public;
grant execute on function public.copy_subjects_to_class(uuid[], uuid) to authenticated;

comment on function public.copy_subjects_to_class(uuid[], uuid) is
  'Subject List''s "Copy to Class" bulk action (issue #642): duplicates the '
  'given Subjects onto one other non-archived Class Offering in the same '
  'School. Source rows are never touched; a Subject whose name already '
  'exists on the target Class (case-insensitive) is skipped, never '
  'overwritten, via subjects_unique_per_class''s own conflict arbiter. '
  'Returns the actual copied / skipped counts, same shape as '
  'copy_class_offerings_to_active_year (0200). No School-Owner gate -- same '
  'authority as adding a Subject by hand.';
