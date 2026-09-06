-- 0182_wave6_academic_year_backfill.sql
-- Wave 6 (issue #591), implementing #575's resolution, item 1-2.
--
-- Backfills schools.active_academic_year (nullable since #570/0175) and
-- class_offerings.academic_year (nullable since #571/0174) for every
-- existing row, then tightens the latter to not null as 0174 always said
-- this wave would.
--
-- A gap #575/#591's own text didn't anticipate, found while implementing
-- this ticket: nothing in the app has ever set active_academic_year -- the
-- only place it's read is addClass's insert (web/app/school/classes/
-- actions.ts), which has always inserted a null academic_year as a result
-- (confirmed: all 7 live class_offerings rows have academic_year null).
-- Backfilling *existing* Schools alone would fix today's data but leave
-- every *future* School (or an existing School's next addClass call, if
-- active_academic_year were ever nulled out again) inserting null into a
-- column this migration is about to make not null -- breaking Add Class
-- outright until #570's still-unbuilt "Start Academic Year" UI exists.
--
-- Fixed with a DB default (current year at insert time) rather than an app-
-- layer fallback: it covers every insert path, including ones outside this
-- request (a future admin tool, a fresh School's very first class), and an
-- Owner can still override it later once #570's UI lands -- the default
-- only ever fires when the column is genuinely unset.
alter table public.schools
  alter column active_academic_year set default extract(year from now())::int;

update public.schools
set active_academic_year = extract(year from now())::int
where active_academic_year is null;

update public.class_offerings co
set academic_year = s.active_academic_year
from public.schools s
where co.school_id = s.id
  and co.academic_year is null;

alter table public.class_offerings
  alter column academic_year set not null;

comment on column public.schools.active_academic_year is
  'The School''s current working-context Academic Year (issue #570, map #568/#582). '
  'Initialized for every School by Wave 6 (#591); defaults to the current calendar '
  'year for any School that predates this default or is created without an explicit '
  'value. Not a Student''s placement -- Class Offering creation may default to this '
  'value, but each Offering''s own academic_year, once set, is independent of this '
  'pointer moving forward.';

comment on column public.class_offerings.academic_year is
  'Which Academic Year this Class Offering belongs to (issue #571, map #568/#582). '
  'Backfilled for every pre-existing row by Wave 6 (#591) from the owning School''s '
  'active_academic_year at that time, then tightened to not null -- every Offering '
  'created from this point on must supply one.';
