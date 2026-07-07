-- Foundation (issue #1): multi-tenant schema skeleton + RLS (ADR 0002, 0003).

create type public.app_role as enum
  ('school_owner', 'staff_user', 'dealer', 'super_admin', 'gov_official');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  school_id uuid references public.schools (id),
  full_name text,
  created_at timestamptz not null default now(),
  -- School-scoped roles must have a school; vendor-side roles must not (Architecture §3).
  constraint school_scoping check
    ((role in ('school_owner', 'staff_user')) = (school_id is not null))
);

alter table public.schools enable row level security;
alter table public.profiles enable row level security;

-- Security-definer helpers so policies can read the caller's profile without RLS recursion.
create function public.app_current_role() returns public.app_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create function public.app_current_school_id() returns uuid
language sql stable security definer set search_path = public as
$$ select school_id from profiles where id = auth.uid() $$;

create policy "members read own school" on public.schools
  for select using (id = public.app_current_school_id());

create policy "super admin manages schools" on public.schools
  for all using (public.app_current_role() = 'super_admin');

create policy "read own profile" on public.profiles
  for select using (id = auth.uid());

create policy "school owner reads own school profiles" on public.profiles
  for select using (
    public.app_current_role() = 'school_owner'
    and school_id = public.app_current_school_id()
  );

create policy "super admin manages profiles" on public.profiles
  for all using (public.app_current_role() = 'super_admin');

-- Self-service School Owner signup: creates the tenant + owner profile atomically.
create function public.register_school(school_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile already exists';
  end if;
  insert into schools (name) values (school_name) returning id into sid;
  insert into profiles (id, role, school_id) values (auth.uid(), 'school_owner', sid);
  return sid;
end $$;

revoke execute on function public.register_school(text) from anon, public;
grant execute on function public.register_school(text) to authenticated;
