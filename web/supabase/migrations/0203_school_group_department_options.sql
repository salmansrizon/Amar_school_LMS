-- 0203_school_group_department_options.sql
-- Group/Department Add Class UX (issue #635, ADR 0025): built-in choices
-- (Science, Business Studies (Commerce), Humanities (Arts)) stay code
-- constants -- this table holds only the School-submitted "Other" values, so
-- they can be offered again on every later Add Class for that School.
--
-- Deliberately not schools.education_levels/configured_shifts' text[]+CHECK
-- shape: those are a School picking a subset of a platform-fixed vocabulary;
-- this is a School inventing a value the platform has never seen, so a CHECK
-- enumerating the allowed set is the wrong tool (see ADR 0025).

create table public.school_group_department_options (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create index school_group_department_options_school_idx
  on public.school_group_department_options (school_id);

-- Case-insensitive dedup per school ("Physics" and "physics" collide),
-- keeping whichever casing was submitted first -- same pattern as
-- subjects_school_id_class_id_lower_name_key (migration 0165).
create unique index school_group_department_options_school_id_lower_name_key
  on public.school_group_department_options (school_id, lower(name));

alter table public.school_group_department_options enable row level security;
create policy "school members manage group department options"
  on public.school_group_department_options
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages group department options"
  on public.school_group_department_options
  for all using (public.app_current_role() = 'super_admin');

comment on table public.school_group_department_options is
  'Per-School custom Group/Department values submitted via Add Class''s Other '
  'option (issue #635). The three built-in choices (Science, Business Studies '
  '(Commerce), Humanities (Arts)) are code constants and never appear here.';
