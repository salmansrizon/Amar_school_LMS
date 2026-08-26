-- 0136_staff_screen_grants_rls.sql
-- GHSA-f3w3-vrhc-983v: Permission Grant is enforced in the browser and nowhere else.
--
-- CONTEXT.md defines a Permission Grant as a Staff User's boolean, screen-level
-- access to a module. proxy.ts enforces it via canOpenScreen/screenKeyForPath —
-- which gates navigation. Row Level Security did not implement it at all: ZERO
-- policies referenced staff_permissions, while 46 tenant tables carried
--   for all using (school_id = public.app_current_school_id())
-- and app_current_school_id() resolves for any Staff User. So a Staff User with
-- the anon key could read and write all of them through PostgREST regardless of
-- their grants — colleagues' bank details, family fee records, disciplinary
-- notes about named children, unreleased exam marks.
--
-- Tenancy always held: school_id still scoped every row to the caller's own
-- School. This was privilege escalation inside a tenant, never across one.

-- ---------------------------------------------------------------------------
-- 1. The predicate.
--
-- School Owner unconditionally; a Staff User only for a screen they hold. Every
-- other role resolves false here, which is safe: the only policies this is added
-- to already required app_current_school_id(), and that is null for everyone
-- except a School Owner or a Staff User. Super Admin reaches these tables
-- through its own "super admin manages X" policies, untouched below.
create or replace function public.app_module_granted(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.app_current_role()
    when 'school_owner' then true
    when 'staff_user' then exists (
      select 1 from staff_permissions
       where staff_user_id = auth.uid() and screen_key = p_module)
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. Which table belongs to which screen.
--
-- Derived by walking every supabase query under app/school/**, FOLLOWING @/lib
-- imports transitively, and keeping the tables read by exactly one screen. The
-- lib hop matters: progress reports pull attendance and behaviour from inside
-- lib/, and every print surface resolves a theme, so a naive app-only scan
-- mis-assigns those. A table read by a handful of screens names them all rather
-- than being dropped from the gate. Tables several screens legitimately share
-- — students, classes, subjects, employees, off_days, schools — are absent on
-- purpose: gating them would break the screens that need them, and CONTEXT.md
-- defines Permission Grant as screen-level, not per-action, so there is no
-- read/write split available to separate those cases. `employees` is handled by
-- section 4 instead, because its problem is columns rather than screens.
--
-- The mapping lives here, in the migration, rather than in a config table: which
-- table belongs to which screen is a structural fact of the codebase, not a
-- per-School setting. It changes only when someone writes another migration.
do $$
declare
  m record;
  p record;
  guard text;
begin
  for m in
    select * from (values
      ('attendance_absence_notes','attendance'),
      -- + exams: the progress report reads attendance through lib/.
      ('attendance_records','attendance,exams'),
      ('employee_leaves','attendance'),
      ('rfid_cards','attendance'),

      ('class_routines','classes'),
      ('class_syllabi','classes'),
      ('routine_slots','classes'),

      ('cocurricular_checklist_marks','exams'),
      ('cocurricular_items','exams'),
      ('exam_combination_members','exams'),
      ('exam_combinations','exams'),
      ('exam_marks','exams'),
      ('exam_routine_entries','exams'),
      ('exam_seat_plans','exams'),
      ('exam_subject_teachers','exams'),
      ('exams','exams'),
      ('grade_bands','exams'),
      ('grading_schemes','exams'),

      ('asset_categories','fees'),
      ('assets','fees'),
      ('bank_cash_accounts','fees'),
      ('bank_cash_transactions','fees'),
      ('director_capital_balances','fees'),
      ('director_capital_transactions','fees'),
      ('fee_collection_records','fees'),
      ('fee_structures','fees'),
      ('voucher_categories','fees'),
      ('vouchers','fees'),

      ('activity_checklist_items','institute'),
      ('daily_checklists','institute'),
      ('logistics_index','institute'),

      ('gallery_albums','notices'),
      ('gallery_photos','notices'),

      ('absence_sms_rules','sms'),
      -- + students: the student profile shows its own SMS history.
      ('sms_log','sms,students'),

      -- + exams: the progress report carries the behaviour summary.
      ('behaviour_log_entries','students,exams'),
      ('student_transfers','students')
    ) as t(tbl, module)
  loop
    -- One screen or several; several become a disjunction. This is still
    -- screen-level access, not per-action — CONTEXT.md's definition holds.
    select string_agg(format('(select public.app_module_granted(%L))', k), ' or ')
      into guard from unnest(string_to_array(m.module, ',')) as k;
    guard := '(' || guard || ')';

    for p in
      select policyname, cmd, qual, with_check
        from pg_policies
       where schemaname = 'public'
         and tablename = m.tbl
         -- Super Admin keeps its own way in.
         and coalesce(qual, with_check) not like '%super_admin%'
         -- So does a Student. app_module_granted() is false for every role that
         -- is not staff, so wrapping a student policy would silently blank the
         -- screen it serves rather than deny it loudly. Only attendance_records
         -- is actually shared today (0146's "student reads own attendance"),
         -- and only filename order keeps this migration ahead of it — which is
         -- not a guarantee worth relying on if 0136 is ever replayed alone.
         and coalesce(qual, '') || coalesce(with_check, '') not like '%app_current_student%'
         -- Idempotent: never double-wrap on replay.
         and coalesce(qual, '') || coalesce(with_check, '') not like '%app_module_granted%'
    loop
      execute format('drop policy %I on public.%I', p.policyname, m.tbl);

      if p.qual is null then
        -- INSERT-only policy (sms_log): no USING clause is permitted.
        execute format('create policy %I on public.%I for %s with check (%s and %s)',
          p.policyname, m.tbl, p.cmd, p.with_check, guard);
      elsif p.with_check is null then
        execute format('create policy %I on public.%I for %s using (%s and %s)',
          p.policyname, m.tbl, p.cmd, p.qual, guard);
      else
        execute format('create policy %I on public.%I for %s using (%s and %s) with check (%s and %s)',
          p.policyname, m.tbl, p.cmd, p.qual, guard, p.with_check, guard);
      end if;
    end loop;
  end loop;
end $$;

-- Deliberately NOT gated: school_print_themes. Every print surface across six
-- screens resolves the theme through lib/institute-print.ts, so gating it on
-- Institute Setup would break printing everywhere. It carries no personal data.

-- ---------------------------------------------------------------------------
-- 3. `employees` is a column problem, not a screen problem.
--
-- Six screens read it — routine teacher names, class teacher, SMS recipients,
-- attendance rosters, global search — so it cannot be gated wholesale. But every
-- one of those twelve call sites wants a NAME, and none wants bank_account,
-- bank_branch, bank_name or date_of_birth.
--
-- Same treatment students got in 0131: a definer view carrying only the safe
-- columns, so they are absent from the surface rather than merely unselected and
-- no future select('*') can leak them back.
drop view if exists public.employee_card;
-- The column list is exactly what the nine cross-screen call sites ask for and
-- nothing more: `mobile` because SMS compose sends to staff, and
-- `grace_override_minutes` because the attendance grace breakdown reads it.
-- Absent, deliberately: bank_name, bank_branch, bank_account, date_of_birth,
-- joining_date, qualification, bank details of any kind.
create view public.employee_card with (security_invoker = off, security_barrier = true) as
  select id, school_id, full_name, category, department, subject_taught,
         mobile, grace_override_minutes, archived_at
    from public.employees
   where school_id = public.app_current_school_id();

grant select on public.employee_card to authenticated;

-- The base table now needs the Employees grant. Name-only readers use the view.
do $$
declare p record;
begin
  for p in
    select policyname, cmd, qual, with_check from pg_policies
     where schemaname = 'public' and tablename = 'employees'
       and coalesce(qual, with_check) not like '%super_admin%'
       and coalesce(qual, '') || coalesce(with_check, '') not like '%app_module_granted%'
  loop
    execute format('drop policy %I on public.employees', p.policyname);
    execute format(
      'create policy %I on public.employees for %s using (%s and (select public.app_module_granted(''employees'')))',
      p.policyname, p.cmd, p.qual);
  end loop;
end $$;
