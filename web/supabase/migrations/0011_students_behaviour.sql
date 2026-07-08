-- Minimal Student record + Behaviour Log (issue #7).
-- Lock rule (CONTEXT.md): an entry becomes read-only exactly 3 days after its
-- created_at — never the free-text incident date.

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  full_name text not null,
  class_name text,
  section text,
  created_at timestamptz not null default now()
);

create index students_school_idx on public.students (school_id);

create table public.behaviour_log_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  note text not null,
  rating int not null check (rating between 0 and 10),
  remind_date date,
  created_at timestamptz not null default now()
);

create index behaviour_entries_student_idx on public.behaviour_log_entries (student_id);

alter table public.students enable row level security;
alter table public.behaviour_log_entries enable row level security;

create policy "school members manage students" on public.students
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages students" on public.students
  for all using (public.app_current_role() = 'super_admin');

create function public.student_in_my_school(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students where id = sid and school_id = public.app_current_school_id()
  )
$$;

create policy "school members manage behaviour log" on public.behaviour_log_entries
  for all using (public.student_in_my_school(student_id));
create policy "super admin manages behaviour log" on public.behaviour_log_entries
  for all using (public.app_current_role() = 'super_admin');

-- The 3-day read-only lock, anchored to created_at (server-enforced).
-- Super Admin is exempt (vendor-side corrections, cascade cleanups).
create function public.enforce_behaviour_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() is distinct from 'super_admin'
     and old.created_at <= now() - interval '3 days' then
    raise exception 'behaviour log entries become read-only 3 days after creation';
  end if;
  return coalesce(new, old);
end $$;

create trigger behaviour_lock
  before update or delete on public.behaviour_log_entries
  for each row execute function public.enforce_behaviour_lock();
