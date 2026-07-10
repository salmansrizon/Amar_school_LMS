-- Accounting I (issue #34, PRD §5.6): fee structures per class/year (recurring
-- monthly or one-time yearly) with copy-between-class/year, and the
-- absent-fine calculator RPC. The calculator reuses is_absent_working_day
-- (0021, issue #12/absence-SMS) per day rather than reimplementing the
-- working-days formula, so the two features can never drift apart.
-- Additive only (staging and main share this database).

create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  class_id uuid not null references public.classes (id) on delete cascade,
  academic_year int not null check (academic_year between 2000 and 2100),
  fee_type text not null check (fee_type in ('monthly', 'one_time_yearly')),
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  fine_per_absent_day numeric(12, 2) not null default 0 check (fine_per_absent_day >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One structure per Class per Year per fee type — a monthly row and a
  -- one-time-yearly row can coexist for the same Class/Year.
  constraint one_structure_per_class_year_type unique (class_id, academic_year, fee_type)
);
create index fee_structures_school_idx on public.fee_structures (school_id);

alter table public.fee_structures enable row level security;
create policy "school members manage fee structures" on public.fee_structures
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages fee structures" on public.fee_structures
  for all using (public.app_current_role() = 'super_admin');

-- class_id must belong to the row's School (mirrors enforce_student_subject_school,
-- 0030). security definer so it can verify tenancy past RLS.
create function public.enforce_fee_structure_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from classes where id = new.class_id and school_id = new.school_id
  ) then
    raise exception 'class does not belong to this school';
  end if;
  return new;
end $$;

create trigger fee_structure_same_school
  before insert or update on public.fee_structures
  for each row execute function public.enforce_fee_structure_school();

create function public.touch_fee_structure() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger fee_structure_touch
  before update on public.fee_structures
  for each row execute function public.touch_fee_structure();

-- Absent-fine calculator: count of absent working days for a Student across a
-- calendar month. Walks every day of the month through is_absent_working_day
-- (0021) — the SAME per-day definition the absence-SMS streak walk uses
-- (Total − Off Days − Approved Leave − Present, off-day/leave overlap already
-- handled inside that function's NOT EXISTS checks).
create function public.absent_working_days_in_month(p_student uuid, p_year int, p_month int)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_school uuid;
  v_start date;
  v_end date;
  v_count int;
begin
  select school_id into v_school from students where id = p_student;
  if v_school is null then
    raise exception 'unknown student';
  end if;
  if v_school is distinct from public.app_current_school_id()
     and public.app_current_role() is distinct from 'super_admin' then
    raise exception 'student not accessible';
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;

  select count(*) into v_count
  from generate_series(v_start, v_end, interval '1 day') gs(d)
  where public.is_absent_working_day(p_student, v_school, gs.d::date);

  return v_count;
end $$;

revoke execute on function public.absent_working_days_in_month(uuid, int, int) from public;
grant execute on function public.absent_working_days_in_month(uuid, int, int) to authenticated;
