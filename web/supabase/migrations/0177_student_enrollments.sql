-- 0177_student_enrollments.sql
-- Wave 1 (issue #584), implementing #573's resolution.
--
-- roll_number lives here, not on students -- moved off entirely (#573): each
-- Enrollment preserves its own Roll Number, so a past year's value stays
-- queryable after promotion, unlike students.roll_number's old
-- overwrite-on-transfer behaviour.
--
-- closed_at/outcome/note are reserved now, deliberately unconstrained beyond
-- "present iff closed_at is" -- #574 (ticket #586/Wave 3) defines the exact
-- outcome vocabulary and its own check constraint later, per #573's own
-- resolution ("do not prematurely lock down the final outcome vocabulary").
--
-- No INSERT/UPDATE policy for `authenticated` at all -- every write goes
-- through the security-definer functions Wave 2 (#585) adds
-- (set_student_enrollment / admit_student_enrollment / close_student_enrollment).
-- Direct client writes are not permitted, full stop (#573's binding requirement).

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  class_offering_id uuid not null references public.class_offerings (id),
  roll_number int,
  closed_at timestamptz,
  outcome text,
  note text,
  created_at timestamptz not null default now(),
  constraint student_enrollments_closed_at_outcome_together check (
    (closed_at is null) = (outcome is null)
  )
);

create index student_enrollments_school_idx on public.student_enrollments (school_id);
create index student_enrollments_student_idx on public.student_enrollments (student_id);
create index student_enrollments_class_offering_idx on public.student_enrollments (class_offering_id);

alter table public.student_enrollments enable row level security;

-- Read-only for authenticated, same capacity walk students' own read policy
-- already uses (0163) -- applied to student_id, the enrollment row's own FK.
-- Deliberately calling the EXISTING staff_class_capacity_for_student(uuid) by
-- name rather than inlining new logic here: Wave 2 (#585) redefines that
-- function's *body* (to join through this very table instead of matching
-- classes by text) without changing its signature, so this policy
-- automatically inherits the corrected behaviour the moment Wave 2 lands --
-- nothing here needs to change again.
create policy "school members read student enrollments" on public.student_enrollments
  for select using (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or public.staff_class_capacity_for_student(student_id) is not null
    )
  );

create policy "super admin manages student enrollments" on public.student_enrollments
  for all using (public.app_current_role() = 'super_admin');

comment on table public.student_enrollments is
  'A Student''s academic placement for one Academic Year (issue #573, map '
  '#568/#582), referencing a Class Offering. Historical placement is never '
  'overwritten -- a new placement always creates a new row; a superseded row '
  'may only be closed (closed_at/outcome set) via the approved transition '
  'functions (Wave 2, #585). No direct client writes are permitted -- there is '
  'no INSERT/UPDATE policy for authenticated on this table.';
