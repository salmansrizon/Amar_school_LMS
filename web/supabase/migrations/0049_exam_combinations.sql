-- Exams III (issue #32, PRD §5.5): multi-exam combination — a named,
-- school-scoped recipe for combining several exams (e.g. 1st + 2nd term)
-- into one result, either by 'sum' (raw marks add together, as if one
-- mega-exam) or 'weighted_percentage' (each exam's overall percent scaled by
-- its weight; PRD's "remainder auto-assigned" is resolved app-side by
-- web/lib/exam-results.ts's resolveMemberWeights — the DB only enforces the
-- two invariants that are always wrong regardless of which member ends up
-- unweighted: more than one blank weight, and weights already over 100).
-- Reuses grading_schemes (issue #31) for the combined result's own bands
-- rather than duplicating scheme fields. Additive only.

create table public.exam_combinations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  class_id uuid references public.classes (id) on delete set null,
  strategy text not null check (strategy in ('sum', 'weighted_percentage')),
  grading_scheme_id uuid references public.grading_schemes (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index exam_combinations_school_idx on public.exam_combinations (school_id);

alter table public.exam_combinations enable row level security;
create policy "school members manage exam_combinations" on public.exam_combinations
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages exam_combinations" on public.exam_combinations
  for all using (public.app_current_role() = 'super_admin');

create function public.enforce_exam_combination_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is not null and not exists (
    select 1 from classes where id = new.class_id and school_id = new.school_id
  ) then
    raise exception 'class does not belong to this school';
  end if;
  if new.grading_scheme_id is not null and not exists (
    select 1 from grading_schemes where id = new.grading_scheme_id and school_id = new.school_id
  ) then
    raise exception 'grading scheme does not belong to this school';
  end if;
  return new;
end $$;

create trigger exam_combination_same_school
  before insert or update on public.exam_combinations
  for each row execute function public.enforce_exam_combination_school();

-- One row per member exam. weight_percent is only meaningful for the
-- 'weighted_percentage' strategy; null means "remainder auto-assigned" to
-- this member (at most one member per combination may be null — enforced
-- below, alongside the not-over-100 invariant).
create table public.exam_combination_members (
  id uuid primary key default gen_random_uuid(),
  combination_id uuid not null references public.exam_combinations (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  weight_percent numeric(5, 2) check (weight_percent is null or (weight_percent >= 0 and weight_percent <= 100)),
  created_at timestamptz not null default now(),
  unique (combination_id, exam_id)
);
create index exam_combination_members_combination_idx on public.exam_combination_members (combination_id);

alter table public.exam_combination_members enable row level security;
create policy "school members manage exam_combination_members" on public.exam_combination_members
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages exam_combination_members" on public.exam_combination_members
  for all using (public.app_current_role() = 'super_admin');

create function public.enforce_exam_combination_member_school() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sibling_null_count int;
  sibling_weight_sum numeric;
begin
  if not exists (
    select 1 from exam_combinations where id = new.combination_id and school_id = new.school_id
  ) then
    raise exception 'combination does not belong to this school';
  end if;
  if not exists (select 1 from exams where id = new.exam_id and school_id = new.school_id) then
    raise exception 'exam does not belong to this school';
  end if;

  select count(*) filter (where weight_percent is null), coalesce(sum(weight_percent), 0)
    into sibling_null_count, sibling_weight_sum
  from exam_combination_members
  where combination_id = new.combination_id and id <> new.id;

  if new.weight_percent is null then
    sibling_null_count := sibling_null_count + 1;
  else
    sibling_weight_sum := sibling_weight_sum + new.weight_percent;
  end if;

  if sibling_null_count > 1 then
    raise exception 'at most one exam in a combination may be left without an explicit weight';
  end if;
  if sibling_weight_sum > 100 then
    raise exception 'combination weights exceed 100%%';
  end if;
  return new;
end $$;

create trigger exam_combination_member_same_school
  before insert or update on public.exam_combination_members
  for each row execute function public.enforce_exam_combination_member_school();
