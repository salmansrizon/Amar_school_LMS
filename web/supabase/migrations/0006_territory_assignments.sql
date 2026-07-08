-- Dealer & Government Official Territory assignment (issue #4).
-- An assignee holds MANY assignment rows; each points at a location node OR a
-- single School ("extended access" — same mechanism, flagged in UI). Tier is
-- per-assignment, Dealer-only, descriptive (CONTEXT.md).

create type public.dealer_tier as enum ('division', 'zilla', 'upazila', 'union');

create table public.territory_assignments (
  id uuid primary key default gen_random_uuid(),
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  location_id uuid references public.locations (id) on delete cascade,
  school_id uuid references public.schools (id) on delete cascade,
  tier public.dealer_tier,
  created_at timestamptz not null default now(),
  constraint one_target check (num_nonnulls(location_id, school_id) = 1)
);

create index territory_assignments_assignee_idx on public.territory_assignments (assignee_id);

-- Assignee must be a Dealer or Government Official; tier only on Dealer rows.
create function public.check_territory_assignee() returns trigger
language plpgsql as $$
declare
  assignee_role public.app_role;
begin
  select role into assignee_role from public.profiles where id = new.assignee_id;
  if assignee_role not in ('dealer', 'gov_official') then
    raise exception 'territory assignments are for dealers and government officials only';
  end if;
  if new.tier is not null and assignee_role <> 'dealer' then
    raise exception 'tier applies only to Dealer assignments';
  end if;
  return new;
end $$;

create trigger territory_assignee_role
  before insert or update on public.territory_assignments
  for each row execute function public.check_territory_assignee();

alter table public.territory_assignments enable row level security;

create policy "assignee reads own assignments" on public.territory_assignments
  for select using (assignee_id = auth.uid());
create policy "super admin manages assignments" on public.territory_assignments
  for all using (public.app_current_role() = 'super_admin');

-- Super Admin mints Dealer / Government Official logins.
-- ponytail: SQL-side auth user creation, same trade-off as create_staff_user.
create function public.create_vendor_user(
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
  if user_role not in ('dealer', 'gov_official') then
    raise exception 'role must be dealer or gov_official';
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

-- Reachability check used by the schools RLS policy. SECURITY DEFINER so it can
-- walk locations/assignments regardless of the caller's row access.
create function public.school_reachable_by_me(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from territory_assignments ta
    where ta.assignee_id = auth.uid()
      and (
        ta.school_id = sid
        or (ta.location_id is not null
            and sid in (select id from public.schools_under_location(ta.location_id)))
      )
  )
$$;

create policy "territory roles read reachable schools" on public.schools
  for select using (
    public.app_current_role() in ('dealer', 'gov_official')
    and public.school_reachable_by_me(id)
  );

-- The assignee's aggregated, deduplicated Schools list with the extended flag:
-- extended = reachable ONLY via a school-scoped ("extended access") row.
create function public.my_territory_schools()
returns table (school_id uuid, name text, is_extended boolean)
language sql stable security definer set search_path = public as $$
  with mine as (select * from territory_assignments where assignee_id = auth.uid()),
  via_location as (
    select s.id, s.name
    from mine m
    cross join lateral public.schools_under_location(m.location_id) s
    where m.location_id is not null
  ),
  via_school as (
    select s.id, s.name
    from mine m join schools s on s.id = m.school_id
    where m.school_id is not null
  )
  select distinct coalesce(l.id, x.id) as school_id,
         coalesce(l.name, x.name) as name,
         (l.id is null) as is_extended
  from via_school x
  full outer join via_location l on l.id = x.id
$$;

revoke execute on function public.my_territory_schools() from anon, public;
grant execute on function public.my_territory_schools() to authenticated;
