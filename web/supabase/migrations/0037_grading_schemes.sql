-- Exams I: grading schemes & pass rules (issue #31, PRD §5.5). A reusable,
-- school-scoped grading scheme (letter/numeric/grade-point) with its grade
-- bands, so exam setup (#47) can pick one per exam. Additive only (staging
-- and main share this database).

create table public.grading_schemes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  scheme_type text not null check (scheme_type in ('grade_point', 'letter', 'numeric')),
  pass_mark_percent numeric(5, 2) not null default 33
    check (pass_mark_percent >= 0 and pass_mark_percent <= 100),
  pass_rule_strategy text not null default 'individual'
    check (pass_rule_strategy in ('individual', 'combined_average', 'optional_conditional')),
  combine_subject_groups boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index grading_schemes_school_idx on public.grading_schemes (school_id);

alter table public.grading_schemes enable row level security;
create policy "school members manage grading_schemes" on public.grading_schemes
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages grading_schemes" on public.grading_schemes
  for all using (public.app_current_role() = 'super_admin');

-- Grade bands: the label/percent-range/grade-point table used by
-- resolveGradeBand() (web/lib/grading.ts) to convert a subject's percent into
-- a letter/GPA. Numeric schemes typically carry none. school_id is
-- denormalized (mirrors student_subjects, class_routines) so RLS and the
-- tenancy trigger below don't need a join through grading_schemes.
create table public.grade_bands (
  id uuid primary key default gen_random_uuid(),
  grading_scheme_id uuid not null references public.grading_schemes (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  label text not null,
  min_percent numeric(5, 2) not null check (min_percent >= 0 and min_percent <= 100),
  max_percent numeric(5, 2) not null check (max_percent >= min_percent and max_percent <= 100),
  grade_point numeric(3, 2) check (grade_point is null or grade_point >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (grading_scheme_id, label)
);
create index grade_bands_scheme_idx on public.grade_bands (grading_scheme_id);
create index grade_bands_school_idx on public.grade_bands (school_id);

alter table public.grade_bands enable row level security;
create policy "school members manage grade_bands" on public.grade_bands
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages grade_bands" on public.grade_bands
  for all using (public.app_current_role() = 'super_admin');

-- A band's grading_scheme_id must belong to the row's own School (mirrors
-- enforce_student_subject_school / enforce_class_ref_school) so a foreign
-- scheme id can't plant a ghost band that passes RLS on its own school_id.
create function public.enforce_grade_band_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from grading_schemes where id = new.grading_scheme_id and school_id = new.school_id
  ) then
    raise exception 'grading scheme does not belong to this school';
  end if;
  return new;
end $$;

create trigger grade_band_same_school
  before insert or update on public.grade_bands
  for each row execute function public.enforce_grade_band_school();
