-- 0132_student_login_provisioning.sql
-- Map #434 / ticket #442: the School Owner issues, sets and resets Student
-- logins. No service-role key (deliberate) — these are self-gating
-- SECURITY DEFINER RPCs, following create_staff_user / create_vendor_user.
--
-- Password hashes use gen_salt('bf', 10). GoTrue writes at cost 10, and its
-- re-hash-on-login branch only fires for cost > 10 or cost == 4 — so a cost-6
-- hash (the gen_salt('bf') default the older RPCs use) would never be upgraded
-- and would stay 16x cheaper to brute-force forever. Student logins start at 10.
-- The pre-existing cost-6 accounts are a separate defect, out of scope here
-- (map #434 "Out of scope").

-- ---------------------------------------------------------------------------
-- 1. The email domain, pinned once per school.
--
-- A Student's address is <student_no>@<domain>.students.invalid. The obvious
-- domain is the school's subdomain, but only 87 of 436 schools have one set, so
-- requiring it would block most schools from issuing any login at all. Instead
-- the domain is resolved once — subdomain if there is one, else a stable slug
-- off the school id — and then STORED, so a school's addresses stay consistent
-- with each other even if someone sets a subdomain later.
alter table public.schools add column if not exists student_login_domain text;

create or replace function public.student_login_domain(p_school uuid) returns text
language plpgsql security definer set search_path = public as $$
declare d text;
begin
  select student_login_domain into d from schools where id = p_school;
  if d is not null then return d; end if;

  select coalesce(nullif(subdomain, ''), 'sch' || substr(replace(id::text, '-', ''), 1, 8))
    into d from schools where id = p_school;
  if d is null then raise exception 'unknown school'; end if;

  update schools set student_login_domain = d where id = p_school;
  return d;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Status panel source.
--
-- last_sign_in_at lives in auth.users, which no school role can read. A definer
-- view scoped to the caller's own school gives the owner "does this Student
-- have a login, and when did they last use it?" without opening auth.users.
-- app_current_school_id() returns null for a Student (0131), so this view is
-- empty for them.
drop view if exists public.student_login_info;
create view public.student_login_info with (security_invoker = off) as
  select s.id as student_id, s.school_id, s.student_no, s.full_name,
         s.class_name, s.section,
         u.email, u.last_sign_in_at, u.created_at as login_created_at
    from public.students s
    join auth.users u on u.id = s.profile_id
   where s.school_id = public.app_current_school_id();

grant select on public.student_login_info to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Shared guard: the caller may provision for this Student.
create or replace function public.can_manage_student_login(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_current_role() = 'school_owner'
     and public.student_in_my_school(p_student_id)
$$;

-- ---------------------------------------------------------------------------
-- 4. Create one login. Returns the derived address.
create or replace function public.create_student_login(p_student_id uuid, p_password text)
returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  target students%rowtype;
  new_id uuid := gen_random_uuid();
  addr text;
begin
  if not public.can_manage_student_login(p_student_id) then
    raise exception 'only a School Owner can issue logins for their own students';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;

  select * into target from students where id = p_student_id for update;
  if target.archived_at is not null then
    raise exception 'archived students cannot be given a login';
  end if;
  if target.profile_id is not null then
    raise exception 'this student already has a login';
  end if;
  if target.student_no is null then
    raise exception 'student has no Student Number';
  end if;

  addr := lower(target.student_no) || '@'
       || public.student_login_domain(target.school_id) || '.students.invalid';
  if exists (select 1 from auth.users where email = addr) then
    raise exception 'login address % is already in use', addr;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at,
                          confirmation_token, recovery_token, email_change,
                          email_change_token_new, email_change_token_current,
                          phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
          addr, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(),
          '', '', '', '', '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), new_id, new_id,
          jsonb_build_object('sub', new_id::text, 'email', addr, 'email_verified', true),
          'email', now(), now(), now());

  insert into public.profiles (id, role, school_id, full_name)
  values (new_id, 'student', target.school_id, target.full_name);

  update students set profile_id = new_id where id = p_student_id;

  perform public.record_audit('student_login', p_student_id::text, 'create',
    target.school_id, null, null, jsonb_build_object('email', addr), null, null, null, null);

  return addr;
end $$;

revoke execute on function public.create_student_login(uuid, text) from anon, public;
grant execute on function public.create_student_login(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reset a password.
--
-- Existing sessions and outstanding tokens are destroyed. A reset is what an
-- owner does when a login is compromised or handed to the wrong child, so
-- leaving the old session alive would defeat the point.
create or replace function public.set_student_password(p_student_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  target students%rowtype;
begin
  if not public.can_manage_student_login(p_student_id) then
    raise exception 'only a School Owner can reset their own students'' passwords';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;

  select * into target from students where id = p_student_id;
  if target.profile_id is null then
    raise exception 'this student has no login';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = target.profile_id;

  delete from auth.sessions where user_id = target.profile_id;
  delete from auth.refresh_tokens where user_id = target.profile_id::text;
  delete from auth.one_time_tokens where user_id = target.profile_id;

  -- 'update', not 'reset_password': audit_log_action_check is a fixed shared
  -- vocabulary (create/update/delete/approve/reject/configure), and widening it
  -- for one feature is a bigger decision than this ticket. The event name goes
  -- in the payload instead.
  perform public.record_audit('student_login', p_student_id::text, 'update',
    target.school_id, null, null, jsonb_build_object('event', 'password_reset'),
    null, null, null, null);
end $$;

revoke execute on function public.set_student_password(uuid, text) from anon, public;
grant execute on function public.set_student_password(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Bulk is deliberately NOT a SQL function.
--
-- One loop in plpgsql would be a single transaction, so one bad row (a Student
-- with no Student Number, a colliding address) aborts the whole class and the
-- owner gets nothing back. Issuing 40 logins is a one-off admin act, not a hot
-- path, so the server action loops create_student_login per Student instead: it
-- creates what it can, reports what it could not, and re-running only fills the
-- gaps. That also keeps password generation in one place rather than two.
