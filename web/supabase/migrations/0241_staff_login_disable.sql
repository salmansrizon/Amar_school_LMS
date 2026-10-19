-- 0241_staff_login_disable.sql
-- Issue #688 (Archiving an employee leaves their staff login active). Index item 1.3.
-- WRITTEN, NOT APPLIED. The app works with and without it: until it is applied
-- the "disable login" action answers "not available yet" and archiving behaves
-- exactly as today (lib/staff-login.ts).
--
-- WHAT
--   1. profiles.login_disabled_at timestamptz, nullable. Null = login works
--      (every existing row). A CHECK allows a value on a staff_user row only.
--   2. set_staff_login_disabled(p_staff uuid, p_disabled boolean): the School
--      Owner turns ONE Staff User login of their own School off or on.
--        off: blocks sign-in (auth.users.banned_until, 100 years ahead), ends
--             every open session (auth.sessions, auth.refresh_tokens,
--             auth.one_time_tokens for that user - the same three deletes
--             set_student_password does, 0132), stamps login_disabled_at.
--        on:  clears banned_until and login_disabled_at.
--      Both are written to the audit log.
--
-- WHY
--   Archiving an Employee only sets employees.archived_at. The linked login
--   keeps working, and nothing in the app could turn a login off at all.
--   It is worse than the issue says: app_current_employee_id() (0138) ignores
--   an ARCHIVED employees row, so an archived teacher's login is read as
--   "no employees row" = office staff, and ADR 0021 then gives it the WHOLE
--   School's students instead of her own classes. Archiving widens access.
--   Turning the login off is what closes that.
--
-- DECISIONS TAKEN (both open in the issue; the owner can reverse them)
--   - Nothing is deleted. The auth user, the profile, the employees link and
--     every staff_permissions row stay, so turning the login back on restores
--     exactly the access it had. The issue's "remove all staff_permissions"
--     is NOT done: it is not reversible, and it would not stop the login from
--     reading students (that table is not grant-gated).
--   - Archiving does not disable the login by itself in the database. The app
--     offers it in the archive confirmation, ticked by default, for the School
--     Owner. Un-archiving does NOT turn the login back on; the app says so and
--     links to the Staff page.
--
-- EFFECT ON EXISTING DATA
--   A new nullable column, null on every row. No row is changed or deleted by
--   this file. The CHECK passes on every existing row (all null).
--
-- EFFECT PER ROLE
--   School Owner ............ gains one function. Can never be disabled: the
--                             function accepts only role = 'staff_user' targets
--                             in the Owner's own School, and the CHECK refuses
--                             the column on any other role.
--   Office staff / class teacher / subject teacher
--                             no change until an Owner disables that one login.
--                             A disabled login cannot sign in or refresh, and
--                             its open sessions end. An access token already
--                             issued stays valid at the API until it expires
--                             (at most the project's JWT lifetime, 1 hour by
--                             default) - migration 0242 closes that window.
--   Student ................. no change; cannot call the function (refused).
--   anon .................... no change; EXECUTE revoked.
--   Super Admin ............. no change; not accepted by the function (it is
--                             the Owner's tool - a Super Admin has the dashboard).
--
-- CALLERS
--   New: web/app/school/staff/actions.ts (setStaffLoginDisabled) and
--   web/app/school/employees/actions.ts (archiveEmployee, optional step).
--   Nothing existing reads or writes the new column or function.
--
-- NOT VERIFIED (needs one check on a branch database before production)
--   That this project's GoTrue version refuses a banned user on
--   /token?grant_type=password and on refresh, and that supabase.auth.getUser()
--   fails once the session row is gone. Both are documented behaviour; neither
--   was run. tests/integration/staff-login-disable.test.ts asserts them.
--
-- PRE-CHECK (read-only; run before applying, keep the output)
--   -- 1. Column and function are not there yet (expect 0 rows, 0 rows).
--   select 1 from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles' and column_name = 'login_disabled_at';
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_staff_login_disabled';
--
--   -- 2. The pieces it relies on exist (expect 5 rows).
--   select 'owner_manages_staff' as needs where to_regprocedure('public.owner_manages_staff(uuid)') is not null
--   union all select 'record_audit' where exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'record_audit')
--   union all select 'auth.sessions' where to_regclass('auth.sessions') is not null
--   union all select 'auth.refresh_tokens' where to_regclass('auth.refresh_tokens') is not null
--   union all select 'auth.one_time_tokens' where to_regclass('auth.one_time_tokens') is not null;
--
--   -- 3. Logins this is for: Staff Users whose linked Employee is archived.
--   --    (Test School A has one today, "UXA-People Emp Test" - issue #686.)
--   select p.school_id, p.id, p.full_name, e.full_name as employee, e.archived_at
--     from public.profiles p
--     join public.employees e on e.profile_id = p.id
--    where p.role = 'staff_user' and e.archived_at is not null
--    order by p.school_id, e.archived_at;
--
--   -- 4. Nobody is already banned by hand (expect 0 rows; a row here would be
--   --    left alone - the function only lifts a ban it set itself).
--   select u.id, u.banned_until from auth.users u
--     join public.profiles p on p.id = u.id
--    where p.role = 'staff_user' and u.banned_until is not null;
--
-- ROLLBACK (exact, in this order). If 0242 is applied, roll 0242 back FIRST:
-- its app_current_school_id() reads the column dropped here.
--   -- a. Turn every login this feature disabled back on, so nobody stays
--   --    locked out by a column that is about to disappear.
--   update auth.users u set banned_until = null
--     from public.profiles p
--    where p.id = u.id and p.login_disabled_at is not null;
--   -- b. Remove the objects.
--   drop function if exists public.set_staff_login_disabled(uuid, boolean);
--   alter table public.profiles drop constraint if exists profiles_login_disabled_staff_only;
--   alter table public.profiles drop column if exists login_disabled_at;
--   notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 1. The marker. The Owner already reads their School's profiles
--    ("school owner reads own school profiles", 0001); a Staff User reads only
--    their own row. No policy changes.
alter table public.profiles
  add column if not exists login_disabled_at timestamptz;

comment on column public.profiles.login_disabled_at is
  'When the School Owner turned this Staff User login off (issue #688). Null = the login works. Set and cleared only by set_staff_login_disabled().';

-- Only a Staff User row can carry it: a School Owner, Student or vendor
-- profile can never be marked disabled, whatever writes the column.
alter table public.profiles drop constraint if exists profiles_login_disabled_staff_only;
alter table public.profiles add constraint profiles_login_disabled_staff_only
  check (login_disabled_at is null or role = 'staff_user');

-- ---------------------------------------------------------------------------
-- 2. The switch.
--
-- search_path stays `public`; the three auth tables are schema-qualified.
-- A finite date, not 'infinity': GoTrue reads banned_until into a Go time
-- value, which cannot hold infinity.
create or replace function public.set_staff_login_disabled(p_staff uuid, p_disabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_was_disabled boolean;
begin
  -- School Owner, and the target is a Staff User of the Owner's own School
  -- (0002). Refuses every other caller and every other target, including the
  -- Owner's own id.
  if p_staff is null or p_disabled is null or not public.owner_manages_staff(p_staff) then
    raise exception 'only a School Owner can turn a staff login of their own School off or on';
  end if;

  select school_id, login_disabled_at is not null
    into v_school, v_was_disabled
    from profiles where id = p_staff for update;

  if p_disabled then
    update auth.users
       set banned_until = now() + interval '100 years', updated_at = now()
     where id = p_staff;
    delete from auth.sessions where user_id = p_staff;
    delete from auth.refresh_tokens where user_id = p_staff::text;
    delete from auth.one_time_tokens where user_id = p_staff;
    update profiles set login_disabled_at = coalesce(login_disabled_at, now()) where id = p_staff;
  else
    -- Lift only a ban this function set: a login banned by hand in the
    -- dashboard has no login_disabled_at and is left alone.
    if v_was_disabled then
      update auth.users set banned_until = null, updated_at = now() where id = p_staff;
    end if;
    update profiles set login_disabled_at = null where id = p_staff;
  end if;

  -- 'update': audit_log_action_check is a fixed vocabulary (see 0132).
  perform public.record_audit('staff_login', p_staff::text, 'update',
    v_school, null,
    jsonb_build_object('disabled', v_was_disabled),
    jsonb_build_object('event', case when p_disabled then 'login_disabled' else 'login_enabled' end,
                       'disabled', p_disabled),
    null, null, null, null);
end $$;

comment on function public.set_staff_login_disabled(uuid, boolean) is
  'School Owner turns one Staff User login of their own School off (blocks sign-in, ends sessions) or on. Deletes nothing: grants and the employees link stay, so "on" restores the same access. Issue #688.';

-- 0150's pattern: CREATE FUNCTION grants EXECUTE to PUBLIC, and anon reaches a
-- function through that grant, so PUBLIC is what has to go.
revoke execute on function public.set_staff_login_disabled(uuid, boolean) from public;
revoke execute on function public.set_staff_login_disabled(uuid, boolean) from anon;
grant execute on function public.set_staff_login_disabled(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
