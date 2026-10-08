-- 0242_disabled_staff_login_has_no_school.sql
-- Issue #688, second lock. OPTIONAL. Apply only after 0241, and only after the
-- coordinator has read this header: it redefines app_current_school_id(), the
-- helper every tenant policy calls.
-- WRITTEN, NOT APPLIED. The app does not depend on it.
--
-- WHAT
--   app_current_school_id() returns null for a profile whose
--   login_disabled_at (0241) is set. One added condition; nothing else changes.
--
-- WHY
--   0241 blocks sign-in and ends the sessions of a disabled Staff User login,
--   but an access token issued just before stays valid at the API until it
--   expires (the project's JWT lifetime, 1 hour by default). During that hour a
--   dismissed employee who kept the token could still read and write through
--   PostgREST. Every school-scoped policy is written
--       school_id = app_current_school_id()
--   so answering null at this one seam refuses all of them at once - the same
--   move 0131 made for the Student role.
--
-- WHY IT CANNOT LOCK A SCHOOL OUT
--   - The condition only bites a row where login_disabled_at is not null.
--   - Only set_staff_login_disabled() (0241) writes that column, and it accepts
--     only role = 'staff_user' targets of the calling Owner's own School.
--   - The CHECK profiles_login_disabled_staff_only (0241) refuses the column on
--     any other role, so a School Owner row can never carry it, whatever writes
--     the table.
--   - The Owner reverses it per login with set_staff_login_disabled(id, false).
--
-- EFFECT ON EXISTING DATA
--   None. Function body only. After 0241 every login_disabled_at is null, so
--   the function answers exactly what it answers today for every user until an
--   Owner disables a login.
--
-- EFFECT PER ROLE
--   School Owner ............ no change, ever (see above).
--   Office staff / class teacher / subject teacher
--                             no change while the login is enabled. Disabled:
--                             every tenant table reads as empty and refuses
--                             writes at once, also for a token already issued.
--   Student ................. no change (already null since 0131).
--   anon .................... no change (auth.uid() is null).
--   Super Admin, vendor roles no change (school_id is null on those profiles).
--
-- WHO RELIES ON THE OLD ANSWER, AND WHY THEY STILL WORK
--   Everything: ~100 RLS policies, app_tenant_member (0084), app_module_granted
--   is separate (0136) but every policy using it also asks for the school id,
--   owner_manages_staff (0002), app_class_scope (0163: null school -> 'none'),
--   the staff_capacity_* walks (0163, 0180), record_audit, workflow_* RPCs.
--   For an ENABLED login the answer is byte-for-byte the same row lookup as
--   0131, so all of them behave as today. For a disabled login they all
--   resolve "not a member of any School", which is the intent.
--   The proxy (web/proxy.ts) and getSchoolContext (web/lib/school/context.ts)
--   read profiles directly, not this function; they are unaffected.
--
-- PRE-CHECK (read-only; run before applying, keep the output)
--   -- 1. 0241 is applied (expect 1 row).
--   select 1 from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles' and column_name = 'login_disabled_at';
--
--   -- 2. The live function is still 0131's. Expect the body to be exactly
--   --      select school_id from profiles where id = auth.uid() and role <> 'student'
--   --    and the header: sql, stable, security definer, search_path=public.
--   --    If it differs, STOP: something redefined it after 0131 and this file
--   --    would overwrite that.
--   select pg_get_functiondef('public.app_current_school_id()'::regprocedure);
--
--   -- 3. Its grants, to compare after applying (create or replace keeps them).
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name = 'app_current_school_id';
--
--   -- 4. Who is affected at the moment of applying (expect only logins an
--   --    Owner disabled on purpose; 0 rows right after 0241).
--   select id, school_id, full_name, login_disabled_at from public.profiles
--    where login_disabled_at is not null;
--
-- ROLLBACK (exact; restores 0131's definition)
--   create or replace function public.app_current_school_id() returns uuid
--   language sql stable security definer set search_path = public as $$
--     select school_id from profiles where id = auth.uid() and role <> 'student'
--   $$;
--   notify pgrst, 'reload schema';

-- No grant or revoke: create or replace keeps the existing grants, and 0150
-- explains why this policy helper must stay executable by every role that can
-- reach a policy (revoking would turn "no rows" into "permission denied").
create or replace function public.app_current_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from profiles
   where id = auth.uid()
     and role <> 'student'
     and login_disabled_at is null
$$;

notify pgrst, 'reload schema';
