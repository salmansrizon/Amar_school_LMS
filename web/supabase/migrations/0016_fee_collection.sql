-- Fee Collection Record (issue #11). Exactly ONE record per Student per month
-- (DB-enforced, unlike legacy's UI-only check); subsequent payments edit the
-- same record's cumulative totals in place — intentionally no per-payment
-- audit trail (CONTEXT.md).

create table public.fee_collection_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  student_id uuid not null references public.students (id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  pay_amount numeric(12, 2) not null default 0 check (pay_amount >= 0),
  fine_amount numeric(12, 2) not null default 0 check (fine_amount >= 0),
  adjust_amount numeric(12, 2) not null default 0 check (adjust_amount >= 0),
  due_amount numeric(12, 2) not null default 0 check (due_amount >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'cheque', 'bank')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- THE legacy invariant, now real: one record per student per month.
  constraint one_record_per_student_month unique (student_id, month, year)
);

create index fee_records_school_idx on public.fee_collection_records (school_id);

alter table public.fee_collection_records enable row level security;

create policy "school members manage fee records" on public.fee_collection_records
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages fee records" on public.fee_collection_records
  for all using (public.app_current_role() = 'super_admin');

create function public.touch_fee_record() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  -- The record is pinned to its student/month/year identity.
  new.student_id := old.student_id;
  new.month := old.month;
  new.year := old.year;
  return new;
end $$;

create trigger fee_record_touch
  before update on public.fee_collection_records
  for each row execute function public.touch_fee_record();
