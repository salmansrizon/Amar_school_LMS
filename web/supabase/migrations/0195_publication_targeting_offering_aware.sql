-- 0195_publication_targeting_offering_aware.sql
-- Issue #595, map #598 Wave 1 (#602) -- the additive "expand" half of moving
-- publication targeting (Notices/Homework/Lesson-plan/daily_lesson/exam_prep)
-- onto Class Offering identity instead of class_name/section text, the same
-- ambiguity #593 already fixed for five other consumers once two Offerings
-- can share a name+section.
--
-- SEQUENCING, deliberately additive only: this migration does NOT rename
-- target_type, does NOT retire 'specific', and does NOT tighten the new
-- target_scope column to NOT NULL. Every not-yet-migrated consumer
-- (createPublication, homeworkTargetsOffering, task_completion_roster, SMS)
-- keeps working completely unchanged. Renaming/retiring target_type here
-- would have broken all of them the moment this migration landed, since the
-- tickets that update them (map #598's Waves 2-6) land afterward and in no
-- particular order relative to each other -- exactly the "widen before
-- fixing consumers" mistake #593 itself was found by. The contract
-- ("expand-contract" migration) phase -- drop target_type, tighten
-- target_scope to NOT NULL -- is map #598's own Wave 7 (#608), once every
-- consumer has actually landed on the new columns. See #598's own
-- correction comment.
--
-- Semantics (grilled and closed on #598/#599/#600/#601, not re-litigated
-- here):
--   target_scope = 'all'       -- school-wide, no target columns set.
--   target_scope = 'offering'  -- exactly one Class Offering, by id. The
--                                  canonical identity is the id, never
--                                  copied display values that could drift.
--   target_scope = 'broadcast' -- a LIVE predicate, re-evaluated against
--                                  current class_offerings every time
--                                  recipients are resolved, never a frozen
--                                  snapshot: Class name (text -- no stable
--                                  Class-identity id exists anywhere in this
--                                  schema, confirmed by inspection) + the
--                                  Academic Year pinned at compose time
--                                  (never spans years) + Shift/Group
--                                  Department/Section each independently
--                                  NULL ("Any", this table's own existing
--                                  convention, just extended) or a specific
--                                  value.
--   target_scope IS NULL       -- not yet migrated (a row a not-yet-updated
--                                  consumer wrote, or an old row this
--                                  migration's own backfill couldn't reach
--                                  for some reason). Every consumer written
--                                  against the new contract this wave onward
--                                  must treat this as "fall back to the
--                                  legacy target_type/text match for this
--                                  one row" until Wave 7's contract phase
--                                  removes the need.

alter table public.publications
  add column target_scope text check (target_scope is null or target_scope in ('all', 'offering', 'broadcast')),
  add column class_offering_id uuid references public.class_offerings (id) on delete set null,
  add column target_academic_year int,
  -- Same vocabulary as class_offerings.shift (0174/class_offerings_shift_valid) --
  -- NULL means Any, not "no shift configured".
  add column target_shift text check (target_shift is null or target_shift in ('Morning', 'Day', 'Evening', 'Night')),
  add column target_group_department text;

-- Partial (most rows will never populate this -- only target_scope='offering'
-- ones do), matching this codebase's own sparse-FK-index convention
-- elsewhere. Caught by code review: without this, every class_offerings
-- deletion's ON DELETE SET NULL, and any future "publications targeting
-- this Offering" query, sequential-scans the whole publications table.
create index publications_class_offering_idx on public.publications (class_offering_id)
  where class_offering_id is not null;

-- class_offering_id must belong to the row's own School -- same shape as
-- enforce_student_enrollment_school (0180) and this table's own prior
-- enforce_publication_shift_school (dropped by 0060 when the old
-- target_shift_id concept was retired) -- a foreign Offering id from another
-- School could otherwise slip past RLS since the row's own school_id column
-- is still correct.
create function public.enforce_publication_offering_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.class_offering_id is not null and not exists (
    select 1 from class_offerings where id = new.class_offering_id and school_id = new.school_id
  ) then
    raise exception 'target class offering does not belong to this school';
  end if;
  return new;
end $$;

drop trigger if exists publication_offering_same_school on public.publications;
create trigger publication_offering_same_school
  before insert or update of class_offering_id on public.publications
  for each row execute function public.enforce_publication_offering_school();

-- Per-scope invariant, one CHECK per scope rather than one large OR'd
-- expression -- caught by code review: a single monolithic CHECK reports
-- every violation under the same generic constraint name/SQLSTATE 23514
-- with no branch-level identification, and a future edit to one branch's
-- nullability rule risks a misplaced paren silently changing enforcement
-- for the other, unrelated branches sharing the same expression. Three
-- named constraints isolate that blast radius to whichever one is touched,
-- and each violation now names which scope's invariant actually failed.
--
-- No explicit "target_scope is null or (...)" gate needed: Postgres CHECK
-- constraints pass when the expression evaluates to NULL, not just TRUE --
-- `target_scope <> 'x'` is already NULL (never FALSE) whenever target_scope
-- itself is NULL, so a not-yet-migrated row satisfies all three constraints
-- automatically. Tightened to NOT NULL only in Wave 7's contract phase
-- (#608), once nothing writes the old shape anymore.
--
-- 'offering' deliberately does NOT require class_offering_id is not null.
-- Caught end-to-end by Wave 2's own RLS test (#603), not by inspection:
-- class_offering_id's own ON DELETE SET NULL (#599's resolution -- deleting
-- a targeted Offering nulls the reference, keeps the publication
-- history-safe) fires as an UPDATE against this same CHECK. Requiring
-- "not null" here would make that exact, deliberately-designed state
-- illegal, turning a normal Offering deletion into a foreign-key failure
-- the moment anything had ever targeted it. Presence of the id at CREATE
-- time is an application-layer concern (the compose UI, Wave 6/#607), not a
-- DB invariant -- the DB only needs to guarantee the predicate columns stay
-- empty for an 'offering'-scoped row, whether or not the id survived.
alter table public.publications
  add constraint publications_target_scope_all_valid check (
    target_scope <> 'all' or (
      class_offering_id is null and target_class_name is null
      and target_academic_year is null and target_shift is null
      and target_group_department is null and target_section is null
    )
  ),
  add constraint publications_target_scope_offering_valid check (
    target_scope <> 'offering' or (
      target_class_name is null and target_academic_year is null
      and target_shift is null and target_group_department is null
      and target_section is null
    )
  ),
  add constraint publications_target_scope_broadcast_valid check (
    target_scope <> 'broadcast' or (
      class_offering_id is null and target_class_name is not null
      and target_academic_year is not null
    )
  );

-- ---------------------------------------------------------------------------
-- One-time backfill of the two existing target_type='specific' rows
-- (verified live against the shared database while grilling #600 -- exactly
-- two exist, not derived from a stale count). target_type itself is left
-- untouched; only the new columns are populated.

-- Row 1: a demo-school lesson_plan, title/content literally "test"/"test",
-- targeting "Nine"/"B" -- inspected directly: that school's only real Class
-- Offering is "Elevan"/"A" (an unrelated typo'd Offering), so nothing this
-- row could have meant survives to resolve against. Confirmed throwaway demo
-- content, not real data with recoverable intent -- deleted rather than
-- fabricating a target. Safe: every table referencing publications.id
-- (student_publication_reads, student_task_completions, homework_submissions,
-- student_messages) is ON DELETE CASCADE, so this orphans nothing.
delete from public.publications where id = 'db5c1e31-621e-492f-baae-f5fe90bf7e02';

-- Row 2 (and any other resolvable legacy row, on whatever database this
-- migration runs against): backfills to a broadcast target with the
-- ORIGINAL recorded Section preserved (never collapsed to Any, and never
-- collapsed to picking one arbitrary matching Offering as if it were an
-- exact pick -- #600's resolution), Shift and Group Department left NULL
-- (Any -- neither concept existed as a recorded value on the legacy shape),
-- and Academic Year taken from the matching Offering's own academic_year
-- (the most faithful reconstruction of "what year was active when this
-- published" -- every existing Offering was backfilled with a real value by
-- Wave 6/#591).
--
-- Only backfills a row with EXACTLY ONE matching Offering (match_count = 1
-- below). Caught by code review: the join has no academic_year filter, and
-- #593/0190 deliberately widened class_offerings' own uniqueness so the
-- SAME (school, name, section) can now legitimately match more than one
-- Offering across different Academic Years -- picking an arbitrary one
-- (e.g. the oldest-created) would silently assign the wrong year with no
-- error, on any database where such a duplicate exists for a legacy row.
-- A row with more than one match is deliberately left target_scope = null,
-- which the safety-net check below already catches and fails loudly on --
-- the same "ambiguous means unresolved, not guessed" rule #593's own
-- ambiguity fixes established, applied here to this migration's own backfill.
with candidate_matches as (
  select p2.id as publication_id, co.academic_year,
    count(*) over (partition by p2.id) as match_count
  from public.publications p2
  join public.class_offerings co
    on co.school_id = p2.school_id
   and co.name = p2.target_class_name
   and coalesce(co.section, '') = coalesce(p2.target_section, '')
  where p2.target_type = 'specific'
)
update public.publications p
set target_scope = 'broadcast',
    target_academic_year = cm.academic_year
from candidate_matches cm
where p.id = cm.publication_id and cm.match_count = 1;

-- Safety net: if this migration ever runs against a database where a
-- 'specific' row does NOT resolve to exactly one Offering (zero matches, an
-- ambiguous multi-match per above, OR a legacy section-only target --
-- target_class_name null, target_section set, a shape 0188's own function
-- explicitly supported as "everyone in section A regardless of class name"
-- -- which this migration's join cannot match at all, since it requires
-- target_class_name to join on, AND which the new target_scope='broadcast'
-- shape has no representation for anyway, since #600 requires a Class name
-- for every broadcast target) and was not the one explicitly handled above,
-- fail loudly rather than silently leaving it target_scope = null
-- indistinguishable from "not yet looked at". Caught by code review as a
-- real, if narrow, gap in this migration's own generality claim -- not
-- reachable by either of the two rows actually on this database (verified),
-- so documented rather than solved: closing it properly means deciding what
-- a class-name-less broadcast even means, a real semantic question for
-- whoever hits it, not a mechanical fix.
do $$
declare
  v_unresolved int;
begin
  select count(*) into v_unresolved
  from public.publications
  where target_type = 'specific' and target_scope is null;
  if v_unresolved > 0 then
    raise exception 'migration 0195: % legacy specific row(s) could not be backfilled and were not explicitly handled -- inspect and fix before proceeding', v_unresolved;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Shared resolution primitive (#601's resolution): one pure, stable function
-- -- no table reads inside it -- mirrored 1:1 by targetMatchesOffering
-- (web/lib/publishing.ts). Every future consumer (student_matches_target,
-- task_completion_roster, homeworkTargetsOffering, SMS) calls this instead
-- of re-implementing the match -- the exact drift task_completion_roster
-- already suffered against student_matches_target, caught by this map's own
-- discovery pass (#601), not repeated here.
create function public.publication_target_matches_offering(
  p_target_scope text,
  p_target_class_offering_id uuid,
  p_target_class_name text,
  p_target_academic_year int,
  p_target_shift text,
  p_target_group_department text,
  p_target_section text,
  p_offering_id uuid,
  p_offering_name text,
  p_offering_academic_year int,
  p_offering_shift text,
  p_offering_group_department text,
  p_offering_section text
) returns boolean
language sql immutable as $$
  -- `is not distinct from`, not `=`, throughout: a plain `=` against a NULL
  -- offering field (e.g. a No-Section Offering) evaluates to NULL, not
  -- false, and NULL short-circuits the surrounding AND chain to NULL rather
  -- than false -- the exact three-valued-logic trap this codebase already
  -- guards against elsewhere (set_student_enrollment's own capacity check).
  -- Caught here by the shared parity test disagreeing with the TS mirror
  -- (JS `===` has no such propagation), not by inspection.
  --
  -- 'offering' branch requires p_offering_id IS NOT NULL explicitly, on top
  -- of the is-not-distinct-from comparison -- caught by code review (Wave 3,
  -- #604): both sides of this one comparison can independently be NULL
  -- (p_target_class_offering_id after the deliberate ON DELETE SET NULL,
  -- #599; p_offering_id for any Student/candidate with no current
  -- Enrollment, #569's own valid "unplaced" state), and `NULL IS NOT
  -- DISTINCT FROM NULL` is TRUE -- silently matching a deleted-Offering
  -- target to an unenrolled Student, who was never eligible for it. No
  -- equivalent risk in the 'broadcast' branch: p_target_class_name is
  -- always non-null there (the CHECK constraint requires it), so only the
  -- offering side can ever be null, which the existing comparison already
  -- resolves to false correctly.
  select case p_target_scope
    when 'all' then true
    when 'offering' then p_offering_id is not null and p_target_class_offering_id is not distinct from p_offering_id
    when 'broadcast' then
      p_target_class_name is not distinct from p_offering_name
      and p_target_academic_year is not distinct from p_offering_academic_year
      and (p_target_shift is null or p_target_shift is not distinct from p_offering_shift)
      and (p_target_group_department is null or p_target_group_department is not distinct from p_offering_group_department)
      and (p_target_section is null or p_target_section is not distinct from p_offering_section)
    else false
  end
$$;

revoke execute on function public.publication_target_matches_offering(
  text, uuid, text, int, text, text, text, uuid, text, int, text, text, text
) from anon, public;
grant execute on function public.publication_target_matches_offering(
  text, uuid, text, int, text, text, text, uuid, text, int, text, text, text
) to authenticated;

comment on function public.publication_target_matches_offering(
  text, uuid, text, int, text, text, text, uuid, text, int, text, text, text
) is
  'The shared targeting predicate (issue #595, map #598): whether a '
  'publication''s target (scope + its own fields) reaches a candidate Class '
  'Offering (its own fields). Pure -- no table reads -- so it is safe to '
  'call live, every time, never cached or snapshotted. Mirrored 1:1 in '
  'TypeScript by targetMatchesOffering (web/lib/publishing.ts); the two are '
  'kept in lockstep by a shared parity test table '
  '(web/lib/publishing-targeting-scenarios.ts). Every consumer of '
  'publication targeting must call this rather than re-implementing the '
  'match -- the exact drift that let task_completion_roster silently '
  'diverge from student_matches_target before this map''s own audit caught it.';

comment on column public.publications.target_scope is
  'Issue #595, map #598 Wave 1 (#602): all/offering/broadcast, superseding '
  'target_type''s all/specific split. NULL means not yet migrated onto the '
  'new contract -- a row a not-yet-updated consumer wrote, or a legacy row '
  'the Wave 1 backfill could not resolve. Every scope-aware consumer must '
  'treat NULL as "fall back to legacy target_type/text matching for this '
  'row" until Wave 7 (#608) tightens this to NOT NULL. target_type itself '
  'is untouched by this migration and still governs every not-yet-migrated '
  'read/write path.';

comment on column public.publications.class_offering_id is
  'Issue #595: the canonical identity for an exact (target_scope=''offering'') '
  'target -- never copied Class/Section/Shift/Group/Year display values, '
  'which could silently drift from the real Offering. NULL when the '
  'targeted Offering was later deleted (ON DELETE SET NULL) -- the '
  'publication stays visible/history-safe but is no longer resolvable to '
  'any Student (#599''s resolution).';

comment on column public.publications.target_academic_year is
  'Issue #595: the Academic Year pinned at compose/publish time for a '
  'target_scope=''broadcast'' target -- never spans years, never re-evaluated '
  'against the School''s active_academic_year later (#599''s resolution). '
  'Required (not null) for a broadcast target; null for all/offering.';

comment on column public.publications.target_shift is
  'Issue #595: target_scope=''broadcast'' Shift predicate -- NULL means Any '
  '(re-evaluated live against every Shift, per #599/#600''s resolution), a '
  'specific value narrows to just that Shift. Same vocabulary as '
  'class_offerings.shift. Null for all/offering targets.';

comment on column public.publications.target_group_department is
  'Issue #595: target_scope=''broadcast'' Group Department predicate -- NULL '
  'means Any, a specific value narrows to just that Group Department. Null '
  'for all/offering targets.';
