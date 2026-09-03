-- 0179_employee_academic_shifts.sql
-- Wave 1 (issue #584), implementing #580's resolution.
--
-- An exact structural mirror of employee_office_times (originally
-- employee_shifts, migration 0012, renamed by 0061) -- no school_id column,
-- tenant scoping implicit via the employee_id join, composite PK doubling as
-- the anti-duplicate guard. Entirely independent of employee_office_times:
-- no shared table, no shared junction, no repurposing (#580's binding
-- requirement, per Map #568's Notes on keeping the new academic Shift
-- concept separate from the pre-existing Office Time concept).

create table public.employee_academic_shifts (
  employee_id uuid not null references public.employees (id) on delete cascade,
  shift text not null check (shift in ('Morning', 'Day', 'Evening', 'Night')),
  primary key (employee_id, shift)
);

alter table public.employee_academic_shifts enable row level security;

-- Exact mirror of employee_office_times' own RLS (0061): one combined
-- "manage" policy, school-scoping via the employee_id join alone (no
-- school_id column to check directly) -- no owner/employee read-vs-write
-- split, matching the established precedent exactly rather than inventing a
-- tighter policy #580 never asked for.
create policy "school members manage employee academic shifts" on public.employee_academic_shifts
  for all using (public.employee_in_my_school(employee_id));

create policy "super admin manages employee academic shifts" on public.employee_academic_shifts
  for all using (public.app_current_role() = 'super_admin');

comment on table public.employee_academic_shifts is
  'An Employee''s permanent academic Shift assignment(s) (issue #580, map '
  '#568/#582) -- entirely independent of employee_office_times (the older, '
  'unrelated attendance grace-window concept). No school_id column, matching '
  'employee_office_times'' own shape -- tenant isolation is implicit via the '
  'employee_id join.';
