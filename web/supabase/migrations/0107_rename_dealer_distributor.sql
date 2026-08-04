-- 0107_rename_dealer_distributor.sql
-- Follow-up #271: complete the cosmetic 'dealer' -> 'distributor' rename that
-- map #222 decided is safe/atomic. Renames the app_role enum VALUE (auto-updates
-- every profiles.role / app_role column), then recreates the functions, RLS
-- policies, and config seed data that referenced the old 'dealer' literal so they
-- stay valid against the renamed enum. Behavior-preserving: same access, new name.

-- 1) Enum value rename. RENAME VALUE (unlike ADD VALUE) is transaction-safe and
--    rewrites every stored app_role in place.
alter type public.app_role rename value 'dealer' to 'distributor';

-- 2) territory functions/policy from 0006 embed the literal 'dealer' in app_role
--    comparisons; recreate them with 'distributor'.
create or replace function public.check_territory_assignee() returns trigger
language plpgsql as $$
declare
  assignee_role public.app_role;
begin
  select role into assignee_role from public.profiles where id = new.assignee_id;
  if assignee_role not in ('distributor', 'gov_official') then
    raise exception 'territory assignments are for distributors and government officials only';
  end if;
  if new.tier is not null and assignee_role <> 'distributor' then
    raise exception 'tier applies only to Distributor assignments';
  end if;
  return new;
end $$;

create or replace function public.create_vendor_user(
  user_email text,
  user_password text,
  user_full_name text,
  user_role public.app_role
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if public.app_current_role() <> 'super_admin' then
    raise exception 'only a Super Admin can create vendor-side accounts';
  end if;
  if user_role not in ('distributor', 'gov_official') then
    raise exception 'role must be distributor or gov_official';
  end if;
  if user_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;
  if length(user_password) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;
  if exists (select 1 from auth.users where email = lower(user_email)) then
    raise exception 'email already in use';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at,
                          confirmation_token, recovery_token, email_change,
                          email_change_token_new, email_change_token_current,
                          phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
          lower(user_email), extensions.crypt(user_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(),
          '', '', '', '', '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), new_id, new_id,
          jsonb_build_object('sub', new_id::text, 'email', lower(user_email), 'email_verified', true),
          'email', now(), now(), now());

  insert into public.profiles (id, role, school_id, full_name)
  values (new_id, user_role, null, user_full_name);

  return new_id;
end $$;

revoke execute on function public.create_vendor_user(text, text, text, public.app_role) from anon, public;
grant execute on function public.create_vendor_user(text, text, text, public.app_role) to authenticated;

drop policy if exists "territory roles read reachable schools" on public.schools;
create policy "territory roles read reachable schools" on public.schools
  for select using (
    public.app_current_role() in ('distributor', 'gov_official')
    and public.school_reachable_by_me(id)
  );

-- 3) Policy-engine config seed (0080) keys are plain text, not enum-bound; rename
--    the role key + its access permission, carrying the grant across.
insert into public.roles (key, label)
  values ('distributor', '{"bn":"ডিস্ট্রিবিউটর","en":"Distributor"}')
  on conflict (key) do update set label = excluded.label;
insert into public.permissions (key, description)
  values ('distributor.access', 'Access the Distributor app group')
  on conflict (key) do nothing;

update public.role_permissions set role_key = 'distributor' where role_key = 'dealer';
update public.role_permissions set permission_key = 'distributor.access' where permission_key = 'dealer.access';

delete from public.roles where key = 'dealer';
delete from public.permissions where key = 'dealer.access';

-- 4) Reserve the new 'distributor' subdomain (0063); keep 'dealer' reserved too so
--    no tenant can claim the legacy slug.
create or replace function public.is_valid_subdomain(slug text) returns boolean
language sql immutable set search_path = public as $$
  select slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
     and slug !~ '--'
     and char_length(slug) between 3 and 63
     and slug <> all (array[
       'admin','api','app','assets','auth','blog','cdn','dealer','distributor','dev','docs',
       'gov','help','login','mail','preview','reset-password','school','signup',
       'staging','static','status','super-admin','support','vercel','www'
     ])
$$;
