-- 0240_employee_attendance_admin_rls.sql
-- Issue #677 (Attendance permission includes employee admin). Index item 1.6.
-- WRITTEN, NOT APPLIED. Staging and production share one database.
--
-- WHAT
--   Seven tables that configure EMPLOYEE attendance keep their read access
--   exactly as it is today and get a narrower WRITE rule:
--     attendance_machines, machine_enroll_infos            (0213, 0211)
--     category_office_hours                                (0205)
--     standing_grace_rules, standing_grace_rule_categories (0210)
--     ad_hoc_grace_exemptions, ad_hoc_grace_exemption_categories (0208)
--   A write now needs all three:
--     1. the row is in the caller's School (unchanged),
--     2. the caller holds the Attendance grant (app_module_granted, 0136),
--     3. the caller is the School Owner, or a Staff User with NO employees row
--        (office staff - ADR 0021's signal, the same test 0163 uses on
--        `classes`).
--
-- WHY
--   The Attendance grant gates the whole /school/attendance segment (ADR 0020,
--   ADR 0029). A Class Teacher who holds it for her own register could add,
--   edit and delete attendance machines, Grace Time rules and Office Hours for
--   the whole School (audit finding AT1). Two things made it worse than the
--   issue says:
--     - category_office_hours, standing_grace_rules(+categories) and
--       ad_hoc_grace_exemptions(+categories) were created AFTER 0136 with a
--       plain "school_id = app_current_school_id()" policy, so today ANY Staff
--       User of the School - with no grant at all - can write them through the
--       API. Condition 2 closes that.
--     - the app refused nothing; it now does (lib/school/employee-attendance-
--       admin.ts), and this migration is the same rule in the database.
--
-- DECISION TAKEN (open in the issue; the owner can reverse it)
--   Not option A (owner only) and not option B (a new permission key). Office
--   staff keep everything they have; only teachers are narrowed. No School has
--   to re-grant anybody. To reverse: run the rollback below and make
--   `mayAdministerEmployeeAttendance` return true.
--
-- EFFECT ON EXISTING DATA
--   None. No row is read, changed or deleted. Policies only.
--
-- EFFECT PER ROLE
--   School Owner ............ no change (read and write everything).
--   Office staff + Attendance  no change (read and write everything).
--   Office staff, no grant .... machines/enrollments: no change (already
--                               refused). Office Hour / grace tables: can
--                               still READ, can no longer WRITE through the
--                               API. They never could in the app: the proxy
--                               refuses /school/attendance without the grant.
--   Class teacher / subject teacher (a Staff User with an employees row)
--                               READ unchanged; WRITE refused on all seven
--                               tables, with or without the grant.
--   Student ................... no change (app_current_school_id() is null for
--                               a Student since 0131; no access before or after).
--   anon ...................... no change (no access).
--   Super Admin ............... no change ("super admin manages ..." untouched).
--
-- WHO RELIES ON THE OLD ACCESS, AND WHY THEY STILL WORK
--   Readers (unchanged - the read policies below repeat today's predicate):
--     app/school/attendance/employee/page.tsx            standing_grace_rules, ad_hoc_grace_exemptions
--     app/school/attendance/employee/grace-time/page.tsx same two + lib/school/ad-hoc-grace.ts
--     app/school/attendance/employee/office-hour/page.tsx category_office_hours
--     app/school/attendance/machine/**/page.tsx          via lib/machine-enrollment-store.ts
--   Writers (all behind the app guard added with this issue, so the only
--   callers left are the Owner and office staff, who pass condition 3):
--     app/school/attendance/employee/grace-time/actions.ts  (incl. rpc save_standing_grace_rule,
--                                                            SECURITY INVOKER - it runs under these policies)
--     app/school/attendance/employee/office-hour/actions.ts
--     app/school/attendance/machine/actions.ts -> lib/machine-enrollment-store.ts
--   SQL that reads these tables and is SECURITY DEFINER, so RLS does not apply:
--     effective_grace_for_my_school(), effective_grace_minutes(uuid) (0210),
--     reconcile_attendance (0211), assign_*_unique_id triggers (0211).
--   Nothing writes these tables from a trigger or from /api (checked with grep
--   over web/app, web/lib and web/supabase/migrations).
--
-- PRE-CHECK (read-only; run before applying, keep the output)
--   -- 1. The policies this file replaces. Expect exactly the seven
--   --    "school members manage ..." rows plus seven "super admin manages ...".
--   --    Any OTHER policy on these tables was not written by a migration:
--   --    stop and review it first.
--   select tablename, policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('attendance_machines','machine_enroll_infos','category_office_hours',
--                        'standing_grace_rules','standing_grace_rule_categories',
--                        'ad_hoc_grace_exemptions','ad_hoc_grace_exemption_categories')
--    order by tablename, policyname;
--
--   -- 2. Who loses write access: Staff Users with an (unarchived) employees
--   --    row who hold the Attendance grant. Expect a short list of teachers.
--   select p.school_id, p.id as staff_user_id, p.full_name, e.id as employee_id
--     from public.profiles p
--     join public.staff_permissions sp on sp.staff_user_id = p.id and sp.screen_key = 'attendance'
--     join public.employees e on e.profile_id = p.id and e.archived_at is null
--    where p.role = 'staff_user'
--    order by p.school_id, p.full_name;
--
--   -- 3. The helper functions exist (all three must return a row).
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('app_module_granted','app_current_employee_id','app_current_role');
--
-- ROLLBACK (exact, in this order; restores 0205/0208/0210/0211/0213 as written)
--   drop policy if exists "employee attendance admins write attendance_machines" on public.attendance_machines;
--   drop policy if exists "school members read attendance_machines" on public.attendance_machines;
--   create policy "school members manage attendance machines" on public.attendance_machines
--     for all
--     using (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')))
--     with check (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')));
--
--   drop policy if exists "employee attendance admins write machine_enroll_infos" on public.machine_enroll_infos;
--   drop policy if exists "school members read machine_enroll_infos" on public.machine_enroll_infos;
--   create policy "school members manage machine enrollments" on public.machine_enroll_infos
--     for all
--     using (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')))
--     with check (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')));
--
--   drop policy if exists "employee attendance admins write category_office_hours" on public.category_office_hours;
--   drop policy if exists "school members read category_office_hours" on public.category_office_hours;
--   create policy "school members manage category_office_hours" on public.category_office_hours
--     for all using (school_id = public.app_current_school_id());
--
--   drop policy if exists "employee attendance admins write standing_grace_rules" on public.standing_grace_rules;
--   drop policy if exists "school members read standing_grace_rules" on public.standing_grace_rules;
--   create policy "school members manage standing_grace_rules" on public.standing_grace_rules
--     for all using (school_id = public.app_current_school_id());
--
--   drop policy if exists "employee attendance admins write standing_grace_rule_categories" on public.standing_grace_rule_categories;
--   drop policy if exists "school members read standing_grace_rule_categories" on public.standing_grace_rule_categories;
--   create policy "school members manage standing_grace_rule_categories" on public.standing_grace_rule_categories
--     for all using (exists (select 1 from public.standing_grace_rules r
--                             where r.id = rule_id and r.school_id = public.app_current_school_id()));
--
--   drop policy if exists "employee attendance admins write ad_hoc_grace_exemptions" on public.ad_hoc_grace_exemptions;
--   drop policy if exists "school members read ad_hoc_grace_exemptions" on public.ad_hoc_grace_exemptions;
--   create policy "school members manage ad_hoc_grace_exemptions" on public.ad_hoc_grace_exemptions
--     for all using (school_id = public.app_current_school_id());
--
--   drop policy if exists "employee attendance admins write ad_hoc_grace_exemption_categories" on public.ad_hoc_grace_exemption_categories;
--   drop policy if exists "school members read ad_hoc_grace_exemption_categories" on public.ad_hoc_grace_exemption_categories;
--   create policy "school members manage ad_hoc_grace_exemption_categories" on public.ad_hoc_grace_exemption_categories
--     for all using (exists (select 1 from public.ad_hoc_grace_exemptions e
--                             where e.id = exemption_id and e.school_id = public.app_current_school_id()));
--
--   notify pgrst, 'reload schema';

-- One loop, three shapes of "this row is in my School":
--   own      - the table carries school_id (and already asks for the grant on read: machines)
--   plain    - the table carries school_id, read has no grant term today
--   via rule / via exemption - a join table scoped through its parent row
--
-- For each table: drop the old FOR ALL policy, then
--   "school members read <t>"                  FOR SELECT, TODAY'S predicate, unchanged
--   "employee attendance admins write <t>"     FOR ALL,    scope + grant + (owner or no employees row)
-- Policies are permissive and OR together, so SELECT = old predicate OR the
-- narrower one = the old predicate; INSERT/UPDATE/DELETE see only the second.
do $$
declare
  m record;
  admin constant text :=
    '(select public.app_module_granted(''attendance''))'
    || ' and ((select public.app_current_role()) = ''school_owner'''
    || ' or (select public.app_current_employee_id()) is null)';
begin
  for m in
    select * from (values
      ('attendance_machines',
       'school members manage attendance machines',
       'school_id = public.app_current_school_id() and (select public.app_module_granted(''attendance''))',
       'school_id = public.app_current_school_id()'),
      ('machine_enroll_infos',
       'school members manage machine enrollments',
       'school_id = public.app_current_school_id() and (select public.app_module_granted(''attendance''))',
       'school_id = public.app_current_school_id()'),
      ('category_office_hours',
       'school members manage category_office_hours',
       'school_id = public.app_current_school_id()',
       'school_id = public.app_current_school_id()'),
      ('standing_grace_rules',
       'school members manage standing_grace_rules',
       'school_id = public.app_current_school_id()',
       'school_id = public.app_current_school_id()'),
      ('standing_grace_rule_categories',
       'school members manage standing_grace_rule_categories',
       'exists (select 1 from public.standing_grace_rules r where r.id = rule_id and r.school_id = public.app_current_school_id())',
       'exists (select 1 from public.standing_grace_rules r where r.id = rule_id and r.school_id = public.app_current_school_id())'),
      ('ad_hoc_grace_exemptions',
       'school members manage ad_hoc_grace_exemptions',
       'school_id = public.app_current_school_id()',
       'school_id = public.app_current_school_id()'),
      ('ad_hoc_grace_exemption_categories',
       'school members manage ad_hoc_grace_exemption_categories',
       'exists (select 1 from public.ad_hoc_grace_exemptions e where e.id = exemption_id and e.school_id = public.app_current_school_id())',
       'exists (select 1 from public.ad_hoc_grace_exemptions e where e.id = exemption_id and e.school_id = public.app_current_school_id())')
    ) as t(tbl, old_policy, read_pred, scope_pred)
  loop
    execute format('drop policy if exists %I on public.%I', m.old_policy, m.tbl);
    execute format('drop policy if exists %I on public.%I', 'school members read ' || m.tbl, m.tbl);
    execute format('drop policy if exists %I on public.%I', 'employee attendance admins write ' || m.tbl, m.tbl);

    execute format('create policy %I on public.%I for select using (%s)',
      'school members read ' || m.tbl, m.tbl, m.read_pred);

    execute format('create policy %I on public.%I for all using ((%s) and %s) with check ((%s) and %s)',
      'employee attendance admins write ' || m.tbl, m.tbl, m.scope_pred, admin, m.scope_pred, admin);
  end loop;
end $$;

notify pgrst, 'reload schema';
