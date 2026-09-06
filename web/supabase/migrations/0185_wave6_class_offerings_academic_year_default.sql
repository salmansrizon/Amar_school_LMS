-- 0185_wave6_class_offerings_academic_year_default.sql
-- Wave 6 (issue #591) follow-up, found by actually running this wave's own
-- new test against the live DB, not anticipated by #575's text.
--
-- 0182 tightened class_offerings.academic_year to not null and gave
-- schools.active_academic_year a default so addClass (which reads that
-- column explicitly) would keep working -- but every OTHER insert into
-- class_offerings that doesn't go through addClass (every test fixture in
-- this suite that creates a Class Offering directly via the Supabase
-- client, and any future application/admin code path that does the same)
-- has no such fallback and would now fail outright on the new not-null
-- constraint. Confirmed by running tests/integration/
-- wave6-transfers-reconciliation.test.ts's own fixture setup against the
-- live-migrated schema: "null value in column academic_year... violates
-- not-null constraint".
--
-- Same fix, same reasoning as 0182's schools.active_academic_year default:
-- current calendar year at insert time, not a cross-table lookup of the
-- owning School's active_academic_year -- simpler, and consistent with
-- 0182's own choice for that column.
alter table public.class_offerings
  alter column academic_year set default extract(year from now())::int;

comment on column public.class_offerings.academic_year is
  'Which Academic Year this Class Offering belongs to (issue #571, map #568/#582). '
  'Backfilled for every pre-existing row by Wave 6 (#591) from the owning School''s '
  'active_academic_year at that time, then tightened to not null. Defaults to the '
  'current calendar year for any insert that doesn''t supply one explicitly (0185) '
  '-- addClass still supplies its own value from schools.active_academic_year first.';
