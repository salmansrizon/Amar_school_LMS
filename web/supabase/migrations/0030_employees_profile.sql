-- Employees I (issue #28, PRD §5.2): full staff/teacher profile (identity,
-- bank info, category, qualification, subject taught, department) and Old
-- Employee soft-archive with restore. Office-time/grace config already
-- shipped in the MVP (0012/0013) — untouched here. Additive only.

alter table public.employees
  add column if not exists mobile text,
  add column if not exists date_of_birth date,
  add column if not exists joining_date date,
  add column if not exists bank_name text,
  add column if not exists bank_branch text,
  add column if not exists bank_account text,
  add column if not exists qualification text,
  add column if not exists department text,
  add column if not exists subject_taught text,
  add column if not exists archived_at timestamptz;

create index if not exists employees_archived_idx
  on public.employees (school_id, archived_at);
