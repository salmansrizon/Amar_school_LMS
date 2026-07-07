-- Staff Permission Grant (issue #2): per-screen boolean allow-list,
-- exactly the legacy sub_user.paths model (PRD §5.10).

create table public.staff_permissions (
  staff_user_id uuid not null references public.profiles (id) on delete cascade,
  screen_key text not null,
  granted_at timestamptz not null default now(),
  primary key (staff_user_id, screen_key)
);

alter table public.staff_permissions enable row level security;

-- True when the acting user is a School Owner and the target is a Staff User
-- of the same School.
create function public.owner_manages_staff(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_current_role() = 'school_owner'
    and exists (
      select 1 from profiles
      where id = target
        and role = 'staff_user'
        and school_id = public.app_current_school_id()
    )
$$;

create policy "staff read own grants" on public.staff_permissions
  for select using (staff_user_id = auth.uid());

create policy "owner reads own school grants" on public.staff_permissions
  for select using (public.owner_manages_staff(staff_user_id));

create policy "owner grants" on public.staff_permissions
  for insert with check (public.owner_manages_staff(staff_user_id));

create policy "owner revokes" on public.staff_permissions
  for delete using (public.owner_manages_staff(staff_user_id));

create policy "super admin manages grants" on public.staff_permissions
  for all using (public.app_current_role() = 'super_admin');

-- School Owner creates a Staff User login for their School.
-- ponytail: creates the auth user via direct SQL (like seed-test.sql) instead of
-- the GoTrue Admin API — swap to a service-role admin call if GoTrue's internal
-- schema changes ever break this.
create function public.create_staff_user(
  staff_email text,
  staff_password text,
  staff_full_name text
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if public.app_current_role() <> 'school_owner' then
    raise exception 'only a School Owner can create staff logins';
  end if;
  if staff_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;
  if length(staff_password) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;
  if exists (select 1 from auth.users where email = lower(staff_email)) then
    raise exception 'email already in use';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at,
                          confirmation_token, recovery_token, email_change,
                          email_change_token_new, email_change_token_current,
                          phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
          lower(staff_email), extensions.crypt(staff_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(),
          '', '', '', '', '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), new_id, new_id,
          jsonb_build_object('sub', new_id::text, 'email', lower(staff_email), 'email_verified', true),
          'email', now(), now(), now());

  insert into public.profiles (id, role, school_id, full_name)
  values (new_id, 'staff_user', public.app_current_school_id(), staff_full_name);

  return new_id;
end $$;

revoke execute on function public.create_staff_user(text, text, text) from anon, public;
grant execute on function public.create_staff_user(text, text, text) to authenticated;
