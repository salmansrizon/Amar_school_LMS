-- 0184_wave6_transfers_reconciliation.sql
-- Wave 6 (issue #591), implementing #575's resolution, items 4/7.
--
-- The three explicit categories #575 already specified, with no silent
-- loss: a student_transfers row whose from_class/from_section resolves to
-- exactly one Class Offering in its own School becomes a *closed*
-- student_enrollments row ('migrated'); one that resolves to zero or more
-- than one Offering (renamed, deleted, or genuinely ambiguous) is
-- 'archived_unresolved' -- reported so it can be exported before
-- student_transfers drops, never silently discarded; a row whose
-- student_id no longer exists in students at all is
-- 'requires_investigation' -- a genuine data-integrity anomaly, not a
-- routine unresolvable-but-understood historical reference, so it must
-- never be folded into the archive bucket.
--
-- Confirmed live (Wave 6's fresh pre-cutover audit, this map's #591
-- planning comment): student_transfers has zero rows on this environment
-- right now, so running this against real data produces an empty report --
-- that is the correct, expected result here, not evidence the mechanism is
-- untested. Real coverage came from a fabricated-fixture integration test
-- run against this function before 0187 dropped it (and the test with it,
-- once the table/function it exercised were retired) -- see 0187's own
-- comment for exactly what was verified and when.
--
-- Known limitation, left as-is since this function is dropped by 0187 in
-- the same wave and never runs against real historical data on this
-- deployment: a migrated row's student_enrollments.created_at defaults to
-- now() (this migration's run time) rather than v_row.transferred_at, so on
-- any OTHER environment where student_transfers is non-empty, a student's
-- true-oldest historical placement could sort after their Wave-6-backfilled
-- current one. Fix forward (set created_at explicitly) if this function is
-- ever revived rather than left dropped.
--
-- Callable two ways, both needed: a live School Owner reconciling their own
-- School's transfers via RPC (what the integration test actually calls,
-- authenticated as a seeded owner) and the one-time migration execution
-- itself, run with no session at all (the same "no auth.uid()" situation
-- 0183's own comment already explains) -- p_school_id is required, not
-- inferred, so the same function serves both without a live-app code path
-- ever being able to reconcile a School it doesn't own.
create or replace function public.wave6_reconcile_student_transfers(p_school_id uuid)
returns table (
  transfer_id uuid,
  category text,
  reason text,
  enrollment_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_class_offering_id uuid;
  v_match_count int;
  v_outcome text;
  v_new_enrollment_id uuid;
begin
  -- A live authenticated caller may only reconcile their own School (or be
  -- super_admin); a migration/admin connection with no session at all
  -- (app_current_role() null) has unconditional access, matching every
  -- other migration in this map.
  if public.app_current_role() is not null then
    if not (p_school_id = public.app_current_school_id() or public.app_current_role() = 'super_admin') then
      raise exception 'not authorized to reconcile this School''s transfers';
    end if;
  end if;

  for v_row in
    select st.* from public.student_transfers st where st.school_id = p_school_id
  loop
    if not exists (select 1 from public.students where id = v_row.student_id) then
      transfer_id := v_row.id;
      category := 'requires_investigation';
      reason := 'student_id no longer exists in students';
      enrollment_id := null;
      return next;
      continue;
    end if;

    select count(*) into v_match_count
    from public.class_offerings co
    where co.school_id = v_row.school_id
      and co.name = v_row.from_class
      and coalesce(co.section, '') = coalesce(v_row.from_section, '');

    if v_match_count = 1 then
      select co.id into v_class_offering_id
      from public.class_offerings co
      where co.school_id = v_row.school_id
        and co.name = v_row.from_class
        and coalesce(co.section, '') = coalesce(v_row.from_section, '');

      v_outcome := case when v_row.note ilike '%promot%' then 'promoted' else 'transferred' end;

      -- Historical, already-closed placement -- roll_number stays null
      -- (student_transfers never recorded one); disable/re-enable brackets
      -- this exact insert so assign_enrollment_roll (0181) never fabricates
      -- a "current" roll for a row being inserted already-closed.
      execute 'alter table public.student_enrollments disable trigger student_enrollment_assign_roll';
      begin
        perform set_config('app.enrollment_transition_in_progress', 'true', true);
        insert into public.student_enrollments
          (school_id, student_id, class_offering_id, roll_number, closed_at, outcome, note)
        values
          (v_row.school_id, v_row.student_id, v_class_offering_id, null, v_row.transferred_at, v_outcome, v_row.note)
        returning id into v_new_enrollment_id;
      exception when others then
        execute 'alter table public.student_enrollments enable trigger student_enrollment_assign_roll';
        raise;
      end;
      execute 'alter table public.student_enrollments enable trigger student_enrollment_assign_roll';

      transfer_id := v_row.id;
      category := 'migrated';
      reason := v_outcome;
      enrollment_id := v_new_enrollment_id;
      return next;
    else
      transfer_id := v_row.id;
      category := 'archived_unresolved';
      reason := case
        when v_match_count = 0 then 'no matching Class Offering (renamed or no longer exists)'
        else format('%s ambiguous matches', v_match_count)
      end;
      enrollment_id := null;
      return next;
    end if;
  end loop;
end $$;

-- Same lockdown every comparable RPC in this codebase gets. This function's
-- own guard (`if app_current_role() is not null then check ownership end
-- if`) is a no-op for an anon-key caller (app_current_role() resolves null
-- with no session), so without this, anon could invoke it for any School
-- during the live interval before 0187 drops it.
revoke execute on function public.wave6_reconcile_student_transfers(uuid) from anon, public;
grant execute on function public.wave6_reconcile_student_transfers(uuid) to authenticated;

comment on function public.wave6_reconcile_student_transfers(uuid) is
  'Wave 6 (issue #591) student_transfers reconciliation -- categorizes every '
  'row for one School into migrated (a new closed student_enrollments row '
  'is created)/archived_unresolved/requires_investigation, per #575''s three '
  'explicit categories. Callable by that School''s Owner/super_admin via RPC, '
  'or with no session at all from a migration/admin connection.';
