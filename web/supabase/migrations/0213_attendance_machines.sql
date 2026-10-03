-- 0213_attendance_machines.sql — Machine Attendance (issue #675).
--
-- 1. attendance_machines: the physical attendance machines a School has
--    installed. Configuration only — nothing here talks to a device; the
--    future Windows sync service will read these rows to know which machine
--    is which. Additive, safe for any deployed code.
-- 2. employee_card gains unique_id, so Attendance-grant staff (who read
--    employees only through this view, 0136) can see an employee's Machine
--    ID on the Employee Enrollment tab. A Machine ID is not sensitive; it is
--    already printed on the employee's own detail page.

-- ---------------------------------------------------------------------------
-- 1. attendance_machines
--
-- shift_scope says which Shift a machine serves:
--   'none'  — the School runs no Shifts, or the machine is not tied to one;
--   'all'   — every configured Shift;
--   'shift' — exactly one, named in `shift`.
-- `shift` is set exactly when shift_scope = 'shift'. Whether that Shift is one
-- the School currently configures is checked by the application (the same
-- split Office Hour uses), because configured_shifts can later be narrowed
-- without rewriting existing rows.
--
-- serial_number identifies the physical device and is unique within a School.
-- Not globally: a cross-tenant unique index would let one School discover
-- another School's serial numbers through the constraint error.
create table public.attendance_machines (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  machine_type text not null check (machine_type in ('zkteco', 'timmy')),
  model text not null check (btrim(model) <> ''),
  serial_number text not null check (btrim(serial_number) <> ''),
  location text not null check (btrim(location) <> ''),
  shift_scope text not null default 'none' check (shift_scope in ('none', 'all', 'shift')),
  shift text check (shift in ('Morning', 'Day', 'Evening', 'Night')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_machines_shift_matches_scope check ((shift_scope = 'shift') = (shift is not null)),
  constraint attendance_machines_serial_unique unique (school_id, serial_number)
);

create index attendance_machines_school_idx on public.attendance_machines (school_id);

-- Same reach as machine_enroll_infos (0211): the School's own rows, behind the
-- Attendance grant; Super Admin keeps its own way in.
alter table public.attendance_machines enable row level security;

create policy "school members manage attendance machines" on public.attendance_machines
  for all
  using (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')))
  with check (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')));

create policy "super admin manages attendance machines" on public.attendance_machines
  for all using (public.app_current_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- 2. employee_card + unique_id
--
-- CREATE OR REPLACE may only append columns, and resets any view option it
-- does not restate — so both options are repeated exactly as 0156 left them.
create or replace view public.employee_card with (security_invoker = off, security_barrier = true) as
  select id, school_id, full_name, category, department, subject_taught,
         mobile, grace_override_minutes, archived_at, unique_id
    from public.employees
   where school_id = public.app_current_school_id();
