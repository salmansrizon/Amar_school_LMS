-- 0175_school_active_academic_year.sql
-- Wave 1 (issue #584), implementing #570's resolution.
--
-- A bare int, matching fee_structures.academic_year's existing precedent
-- exactly (same 2000-2100 bound) -- no dedicated academic_years table. This
-- is the School's "current working context" pointer: never itself a source
-- of any Student's placement, and forward-only once populated (enforced at
-- the application layer by the "Start Academic Year" action, Wave 3/5 -- not
-- a DB constraint, since a plain int column has no memory of its own
-- previous value to compare against).
--
-- Nullable until Wave 6 (#591) initializes it per School -- a School with no
-- active_academic_year yet is a pre-migration state, not an error.

alter table public.schools
  add column active_academic_year int
    check (active_academic_year is null or active_academic_year between 2000 and 2100);

comment on column public.schools.active_academic_year is
  'The School''s current working-context Academic Year (issue #570, map #568/#582). '
  'Not a Student''s placement -- Class Offering creation may default to this value, '
  'but each Offering''s own academic_year, once set, is independent of this pointer '
  'moving forward. Nullable until Wave 6 (#591) initializes it.';
