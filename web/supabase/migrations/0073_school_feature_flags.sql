-- 0073_school_feature_flags.sql
-- Per-school feature flags (map #158, ticket #168): STORAGE + super-admin toggle
-- UI only. Enforcement (hiding modules school-side) is explicitly deferred, so
-- this migration only persists the flat booleans. One row per (school, flag);
-- absent row = disabled (the default).

create table public.school_feature_flags (
  school_id uuid not null references public.schools (id) on delete cascade,
  flag_key text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (school_id, flag_key)
);

alter table public.school_feature_flags enable row level security;

-- Super-admin toggles them; a school may read its own (so future enforcement can
-- gate modules without another migration).
create policy "super admin manages feature flags" on public.school_feature_flags
  for all using (public.app_current_role() = 'super_admin');
create policy "school reads own feature flags" on public.school_feature_flags
  for select using (school_id = public.app_current_school_id());
