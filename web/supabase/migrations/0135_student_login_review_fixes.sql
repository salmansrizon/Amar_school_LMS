-- 0135_student_login_review_fixes.sql
-- Code-review pass on #442. Four findings, three of them security.

-- ---------------------------------------------------------------------------
-- 1. student_login_domain was callable by anyone, and wrote.
--
-- 0132 shipped it without the revoke/grant pair both precedents close with
-- (create_staff_user, create_vendor_user), so Postgres' default EXECUTE TO
-- PUBLIC stood: `anon` could call a SECURITY DEFINER function that does
--   update schools set student_login_domain = d where id = p_school
-- for ANY school id, and get that school's subdomain back. Cross-tenant write
-- and read, on an unauthenticated path.
--
-- Gate it on the caller's own school, then close the grant.
create or replace function public.student_login_domain(p_school uuid) returns text
language plpgsql security definer set search_path = public as $$
declare d text;
begin
  if p_school is null or p_school <> public.app_current_school_id() then
    raise exception 'not authorized for this school';
  end if;

  select student_login_domain into d from schools where id = p_school;
  if d is not null then return d; end if;

  -- 12 hex characters, not 8. The fallback has to be unique across every school
  -- that never set a subdomain, and the unique index below turns a collision
  -- into a hard failure rather than a silently shared domain — so the odds have
  -- to be negligible, not merely small.
  select coalesce(nullif(subdomain, ''), 'sch' || substr(replace(id::text, '-', ''), 1, 12))
    into d from schools where id = p_school;
  if d is null then raise exception 'unknown school'; end if;

  update schools set student_login_domain = d where id = p_school;
  return d;
end $$;

revoke execute on function public.student_login_domain(uuid) from anon, public;
grant execute on function public.student_login_domain(uuid) to authenticated;

revoke execute on function public.can_manage_student_login(uuid) from anon, public;
grant execute on function public.can_manage_student_login(uuid) to authenticated;

-- Two schools sharing a login domain would make the second one's
-- create_student_login fail forever with "address already in use", with nothing
-- in the UI to recover. Make it impossible instead of unlikely.
create unique index if not exists schools_student_login_domain_unique
  on public.schools (student_login_domain) where student_login_domain is not null;

-- ---------------------------------------------------------------------------
-- 2. student_login_info was school-wide, not owner-only.
--
-- #442 says "Owner-only, and only for students of the caller's own school." The
-- RPCs enforce both. The view enforced only the second, so any Staff User could
-- read every Student's login address and last_sign_in_at straight off
-- PostgREST — the owner gate lived in a page component, which is not a gate.
drop view if exists public.student_login_info;
create view public.student_login_info with (security_invoker = off, security_barrier = true) as
  select s.id as student_id, s.school_id, s.student_no, s.full_name,
         s.class_name, s.section,
         u.email, u.last_sign_in_at, u.created_at as login_created_at
    from public.students s
    join auth.users u on u.id = s.profile_id
   where s.school_id = public.app_current_school_id()
     and public.app_current_role() = 'school_owner';

grant select on public.student_login_info to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Validate the address that is actually about to be written.
--
-- student_no is owner-overridable, and both precedents check the address shape
-- before inserting. The 0131 CHECK already confines student_no to characters
-- that are legal in an email local part, but this asserts the built result
-- rather than trusting that the two rules stay in agreement.
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
  if addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Student Number % does not make a usable login address', target.student_no;
  end if;
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
