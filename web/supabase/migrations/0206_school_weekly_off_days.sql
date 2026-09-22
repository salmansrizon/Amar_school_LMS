-- 0206_school_weekly_off_days.sql
-- Weekly Off-Day (issue #665, ADR 0027): replaces the hardcoded "Saturday is
-- always off" rule in lib/attendance-manual.ts's dayOffInfo() with a
-- per-school configurable set of weekdays.
--
-- A column, not a new table alongside off_days -- see ADR 0027. Shape matches
-- schools.configured_shifts (migration 0176) exactly: a small, fixed-size
-- vocabulary, replaced wholesale on save, no per-element metadata.
--
-- Values follow JS Date.getUTCDay() (0 = Sunday ... 6 = Saturday), the same
-- convention dayOffInfo() already uses. Default '{6}' preserves every
-- existing School's current Saturday-only behavior exactly -- an empty
-- default would silently remove off-day shading for every School that
-- hasn't touched this new setting yet.

alter table public.schools
  add column weekly_off_days smallint[] not null default '{6}'::smallint[],
  add constraint schools_weekly_off_days_valid check (
    weekly_off_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  );

comment on column public.schools.weekly_off_days is
  'Weekdays this School treats as off every week (0=Sunday .. 6=Saturday, '
  'Date.getUTCDay() convention), replacing the old hardcoded Saturday-only '
  'rule (issue #665, ADR 0027). Wholesale-replaced on save, never merged -- '
  'selecting Friday+Saturday clears out whatever was selected before. '
  'Default {6} matches every existing School''s pre-#665 behavior.';
