-- 0194_start_academic_year.sql
-- Issue #594 -- schools.active_academic_year (0175/#570) has had a DB
-- default (0182, Wave 6) since it was introduced, but no write path has ever
-- existed: no UI, no action, no RPC. This is that missing "Start Academic
-- Year N" action #570 named explicitly ("a distinct, forward-only named
-- action ... explicitly not a promotion/enrollment trigger") but deferred at
-- the time.
--
-- A dedicated security definer RPC, not a plain `.update()` through the
-- existing "owner updates own school" RLS policy (0043) -- mirrors
-- set_student_enrollment's own pattern (0180) for a named domain transition:
-- forward-only is an invariant a bare `int` column has no memory to enforce
-- via CHECK (a CHECK only ever sees the new row, never the row it's
-- replacing), so the compare-against-current-value-and-write must happen
-- atomically in one function, not as a read-then-write round trip from the
-- application layer that a concurrent second write could race.
--
-- Scope, confirmed with the user (grilled, #594): pure pointer flip only --
-- no Class Offering auto-cloning, no interaction with set_student_enrollment
-- or any Enrollment/promotion state, no notification. School Owner only,
-- matching "owner updates own school"'s own role check exactly. History
-- lives in the existing generic audit_log (entity_type 'school', action
-- 'configure' -- the same action every other settings-style RPC in this
-- schema uses, e.g. set_feature_state, 0081) -- no dedicated
-- academic_year_history table.

-- "owner updates own school" (0043) is a plain, unrestricted-by-column RLS
-- UPDATE policy -- without this trigger, the RPC below being "the sole
-- sanctioned way to change the year" would be a documentation convention
-- only, not an actual guarantee: any Owner-authenticated PostgREST call
-- (`schools.update({active_academic_year: ...})`) could still set the
-- column directly, silently bypassing the forward-only check entirely. Same
-- gap class, same fix, as enforce_current_enrollment_id_via_transition_only
-- (0180) -- a GUC-gated trigger that only the sanctioned function can lift.
-- Guards UPDATE only (not INSERT): nothing in this codebase inserts a
-- schools row with an explicit active_academic_year -- it is always left to
-- this column's own DB default (0182).
create function public.enforce_active_academic_year_via_transition_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.academic_year_transition_in_progress', true), '') = 'true' then
    return new;
  end if;
  if new.active_academic_year is distinct from old.active_academic_year then
    raise exception 'active_academic_year may only be changed by start_academic_year';
  end if;
  return new;
end $$;

drop trigger if exists school_active_academic_year_via_transition_only on public.schools;
create trigger school_active_academic_year_via_transition_only
  before update of active_academic_year on public.schools
  for each row execute function public.enforce_active_academic_year_via_transition_only();

create function public.start_academic_year(p_year int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_school schools%rowtype;
begin
  -- Lock the school row first, exactly like set_student_enrollment's own
  -- `for update` on the student row -- serializes concurrent attempts to
  -- start a year for the SAME school, so a second concurrent call blocks
  -- here until the first commits, then re-reads the now-current value
  -- rather than racing it with a stale forward-only comparison.
  select * into v_school
  from schools
  where id = public.app_current_school_id()
  for update;
  if not found then
    raise exception 'school not accessible';
  end if;

  -- Explicit authorization check: security definer bypasses RLS on this
  -- function's own write, so "owner updates own school" (0043) cannot be
  -- left to do this work -- it must be checked inline, evaluated against
  -- the exact same role literal that policy's own USING clause checks.
  if public.app_current_role() is distinct from 'school_owner' then
    raise exception 'not authorized -- School Owner only';
  end if;

  -- Same bound the column's own CHECK constraint (0175) already enforces --
  -- checked explicitly here first so the caller gets this function's own
  -- clear error message rather than a generic constraint-violation surfaced
  -- from the UPDATE below.
  if p_year < 2000 or p_year > 2100 then
    raise exception 'academic year must be between 2000 and 2100';
  end if;

  -- Forward-only (#570's own resolution). A null active_academic_year is a
  -- pre-Wave-6 state (0175) that should no longer exist in practice (Wave 6
  -- backfilled every School), but is handled here as "no prior year to be
  -- forward of" rather than assumed impossible.
  if v_school.active_academic_year is not null and p_year <= v_school.active_academic_year then
    raise exception 'academic year must be greater than the current active academic year (%)', v_school.active_academic_year;
  end if;

  -- Lifts the trigger above for this one sanctioned write, exactly like
  -- set_student_enrollment's own app.enrollment_transition_in_progress GUC
  -- (0180) -- local (third argument true) so it resets automatically at the
  -- end of this transaction rather than leaking into the session.
  perform set_config('app.academic_year_transition_in_progress', 'true', true);
  update schools set active_academic_year = p_year where id = v_school.id;

  perform public.record_audit(
    'school', v_school.id::text, 'configure',
    v_school.id, null,
    jsonb_build_object('active_academic_year', v_school.active_academic_year),
    jsonb_build_object('active_academic_year', p_year)
  );

  return p_year;
end;
$$;

revoke execute on function public.start_academic_year(int) from anon, public;
grant execute on function public.start_academic_year(int) to authenticated;

comment on function public.start_academic_year(int) is
  'The "Start Academic Year N" named domain action (issue #570, #594): '
  'atomically advances the calling School''s active_academic_year (School '
  'Owner only, forward-only) and records the transition in audit_log. Pure '
  'pointer flip -- does not touch class_offerings, student_enrollments, or '
  'any other row; new Class Offerings pick up the new value on their own '
  'next creation via addClass''s existing default.';
