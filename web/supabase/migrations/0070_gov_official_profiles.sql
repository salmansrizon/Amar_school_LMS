-- 0070_gov_official_profiles.sql
-- Government Official attributes (map #158, ticket #164): a designation + the
-- education levels an official oversees. Kept in a side table keyed to the
-- profile rather than widening the shared profiles table with role-specific
-- columns. Territory assignments continue to reuse territory_assignments (0006).

create table public.gov_official_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  designation text,
  education_level_scope text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.gov_official_profiles enable row level security;

-- Super-admin manages these from the panel; an official may read their own.
create policy "super admin manages gov official profiles" on public.gov_official_profiles
  for all using (public.app_current_role() = 'super_admin');
create policy "gov official reads own profile" on public.gov_official_profiles
  for select using (
    public.app_current_role() = 'gov_official' and profile_id = auth.uid()
  );
