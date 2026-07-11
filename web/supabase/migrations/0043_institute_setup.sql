-- Institute Setup & Misc (issue #39, PRD §5.11): deepen `schools` with the
-- Bangladesh-specific registration profile + education levels offered, and
-- add the daily activity checklist (date-range reporting) and the
-- logistics/physical-file index. Address hierarchy and Cluster assignment
-- already live on `schools` (location_id / cluster_id, issue #3/#1) — no
-- duplication needed there.

alter table public.schools
  add column institute_code text,
  add column eiin_no text,
  add column mpo_enlisted boolean not null default false,
  add column mpo_code text,
  add column center_code text,
  add column education_levels text[] not null default '{}'::text[],
  add constraint schools_education_levels_valid check (
    education_levels <@ array['primary', 'secondary', 'higher_secondary', 'madrasah']::text[]
  );

-- Only a School Owner may edit their own School's profile (registration
-- fields, cluster, education levels) — Staff Users may be granted the
-- "institute" screen for the checklist/logistics tabs but never this one.
create policy "owner updates own school" on public.schools
  for update using (
    id = public.app_current_school_id() and public.app_current_role() = 'school_owner'
  );

create table public.daily_checklists (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  checklist_date date not null,
  flag_hoisted boolean not null default false,
  anthem_rendered boolean not null default false,
  assembly_held boolean not null default false,
  classes_started_on_time boolean not null default false,
  premises_cleaned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, checklist_date)
);

create index daily_checklists_school_date_idx on public.daily_checklists (school_id, checklist_date desc);

alter table public.daily_checklists enable row level security;

create policy "school members manage daily_checklists" on public.daily_checklists
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages daily_checklists" on public.daily_checklists
  for all using (public.app_current_role() = 'super_admin');

create table public.logistics_index (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  item_type text not null,
  year text not null,
  storage_location text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index logistics_index_school_idx on public.logistics_index (school_id);

alter table public.logistics_index enable row level security;

create policy "school members manage logistics_index" on public.logistics_index
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages logistics_index" on public.logistics_index
  for all using (public.app_current_role() = 'super_admin');
