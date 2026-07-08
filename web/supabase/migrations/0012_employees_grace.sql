-- Minimal Employee + Considerable Grace Window (issue #9, PRD §5.2).
-- Grace can be configured at 4 levels; the effective value for any check is
-- the MAX across every applicable configured value.

alter table public.schools add column default_grace_minutes int
  check (default_grace_minutes is null or default_grace_minutes >= 0);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  grace_minutes int check (grace_minutes is null or grace_minutes >= 0),
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  full_name text not null,
  category text,
  grace_override_minutes int check (grace_override_minutes is null or grace_override_minutes >= 0),
  created_at timestamptz not null default now()
);

create table public.employee_shifts (
  employee_id uuid not null references public.employees (id) on delete cascade,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  primary key (employee_id, shift_id)
);

create table public.category_grace_minutes (
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  category text not null,
  grace_minutes int not null check (grace_minutes >= 0),
  primary key (school_id, category)
);

create index shifts_school_idx on public.shifts (school_id);
create index employees_school_idx on public.employees (school_id);

alter table public.shifts enable row level security;
alter table public.employees enable row level security;
alter table public.employee_shifts enable row level security;
alter table public.category_grace_minutes enable row level security;

create policy "school members manage shifts" on public.shifts
  for all using (school_id = public.app_current_school_id());
create policy "school members manage employees" on public.employees
  for all using (school_id = public.app_current_school_id());
create policy "school members manage category grace" on public.category_grace_minutes
  for all using (school_id = public.app_current_school_id());

create function public.employee_in_my_school(emp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees where id = emp and school_id = public.app_current_school_id()
  )
$$;

create policy "school members manage employee shifts" on public.employee_shifts
  for all using (public.employee_in_my_school(employee_id));

create policy "super admin manages shifts" on public.shifts
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin manages employees" on public.employees
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin manages employee shifts" on public.employee_shifts
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin manages category grace" on public.category_grace_minutes
  for all using (public.app_current_role() = 'super_admin');

-- Owner-scoped setter for the school-wide default (null clears it).
create function public.set_school_default_grace(minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() not in ('school_owner', 'staff_user') then
    raise exception 'school members only';
  end if;
  if minutes is not null and minutes < 0 then
    raise exception 'grace must be >= 0';
  end if;
  update schools set default_grace_minutes = minutes
  where id = public.app_current_school_id();
end $$;

-- The resolution rule: MAX across school default, category default, every
-- assigned shift, and the individual override. Unconfigured levels are
-- ignored; nothing configured = 0.
create function public.effective_grace_minutes(emp uuid) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.employee_in_my_school(emp)
     and public.app_current_role() is distinct from 'super_admin' then
    raise exception 'employee not accessible';
  end if;

  return (
    select coalesce(max(v), 0) from (
      select s.default_grace_minutes as v
      from employees e join schools s on s.id = e.school_id
      where e.id = emp
      union all
      select c.grace_minutes
      from employees e join category_grace_minutes c
        on c.school_id = e.school_id and c.category = e.category
      where e.id = emp
      union all
      select sh.grace_minutes
      from employee_shifts es join shifts sh on sh.id = es.shift_id
      where es.employee_id = emp
      union all
      select e.grace_override_minutes from employees e where e.id = emp
    ) levels
  );
end $$;

revoke execute on function public.set_school_default_grace(int) from anon, public;
revoke execute on function public.effective_grace_minutes(uuid) from anon, public;
grant execute on function public.set_school_default_grace(int) to authenticated;
grant execute on function public.effective_grace_minutes(uuid) to authenticated;
