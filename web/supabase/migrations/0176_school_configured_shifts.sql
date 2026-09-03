-- 0176_school_configured_shifts.sql
-- Wave 1 (issue #584), implementing #576's resolution.
--
-- No `shifts` lookup table -- the four values are a fixed, code-owned
-- vocabulary (ACADEMIC_SHIFTS, application-layer, Wave 3/5), not tenant-
-- extensible data. No `has_shift` boolean either: an empty array *is*
-- "No Shift", full stop -- matching schools.education_levels text[]'s exact
-- existing precedent (migration 0043_institute_setup.sql) character-for-
-- character, right down to the constraint-naming convention.

alter table public.schools
  add column configured_shifts text[] not null default '{}'::text[],
  add constraint schools_configured_shifts_valid check (
    configured_shifts <@ array['Morning', 'Day', 'Evening', 'Night']::text[]
  );

comment on column public.schools.configured_shifts is
  'Which of the four static Shifts this School uses (issue #576, map #568/#582). '
  'Empty array means No Shift -- there is no separate has_shift flag. Authoritative '
  'available-shift-vocabulary source for every downstream Shift feature: Global '
  'Shift Selection (#577), Class Offering''s shift column (#578), Employee '
  'multi-shift assignment (#580) all derive their choices from this column, never '
  'from the raw ACADEMIC_SHIFTS constant directly.';
