-- 0198_publication_targeting_contract_phase.sql
-- Issue #595, map #598 Wave 7 (#608) -- the "contract" half of the
-- expand-contract migration 0195 deliberately deferred. Waves 2-6 have all
-- landed: every consumer of publication targeting (the Student RLS SELECT
-- policy + student_material, task_completion_roster, homeworkTargetsOffering,
-- SMS recipient resolution) now resolves through the shared
-- publication_target_matches_offering predicate, and the one remaining write
-- path that sets a target (createPublication) populates target_scope directly.
-- Nothing depends on the pre-#595 target_type/'specific' shape or on the
-- transitional target_scope-is-null fallback anymore, so this migration does
-- the actual cutover:
--
--   1. Backfill any straggler rows whose target_scope is still null (a row a
--      not-yet-migrated writer created during the Wave 1-6 window), using
--      migration 0195's own rule: target_type='all' -> 'all'; a resolvable
--      'specific' row -> 'broadcast' with the matched Offering's academic_year
--      and its recorded Section preserved; anything still unresolved fails the
--      migration loudly rather than being silently broadened.
--   2. Remove the transitional fallback scaffolding: the target_type='all'
--      fast-path branches, publication_target_matches_offering_any (the
--      scope-null dispatch), and publication_target_matches_offering_legacy
--      (the pre-#595 text predicate). Every caller collapses onto
--      publication_target_matches_offering directly.
--   3. Drop target_type entirely -- superseded by target_scope, which has
--      carried the real meaning since 0195.
--   4. Tighten target_scope to NOT NULL + in ('all','offering','broadcast'),
--      dropping 0195's transitional "target_scope is null or (...)" exemption.
--
-- After this migration the ONLY place the targeting match logic exists is
-- publication_target_matches_offering (SQL, migration 0195) and its 1:1 TS
-- mirror targetMatchesOffering (web/lib/publishing.ts) -- map #598's
-- destination.
--
-- NOTE on the one write path NOT touched here: record_subscription_reminder
-- (0069) used to `insert into publications (... target_type ...) values (...
-- 'all' ...)`, but migration 0158 already removed that insert entirely (the
-- reminder Notice was leaking billing messages into every Student's feed once
-- #434 gave Students a publications read policy). Its live 0158 body has no
-- target_type reference and needs no change -- do not "restore" the insert.

-- ---------------------------------------------------------------------------
-- 1. Straggler backfill. Mirrors 0195's backfill exactly (same CTE, same
--    match_count=1 guard against #593/0190's deliberately-widened
--    class_offerings uniqueness, same loud failure on anything left
--    unresolved) -- generalised from the two known #600 rows to "every row a
--    Wave 1-6-window writer might have left target_scope null on".

update public.publications
set target_scope = 'all'
where target_scope is null and target_type = 'all';

with candidate_matches as (
  select p2.id as publication_id, co.academic_year,
    count(*) over (partition by p2.id) as match_count
  from public.publications p2
  join public.class_offerings co
    on co.school_id = p2.school_id
   and co.name = p2.target_class_name
   and coalesce(co.section, '') = coalesce(p2.target_section, '')
  where p2.target_scope is null and p2.target_type = 'specific'
)
update public.publications p
set target_scope = 'broadcast',
    target_academic_year = cm.academic_year
from candidate_matches cm
where p.id = cm.publication_id and cm.match_count = 1;

do $$
declare
  v_unresolved int;
begin
  select count(*) into v_unresolved
  from public.publications
  where target_scope is null;
  if v_unresolved > 0 then
    raise exception 'migration 0198: % publication row(s) still have target_scope null after backfill -- inspect and resolve before the cutover (0195''s same rule: resolvable specific -> broadcast, unresolvable -> a real decision, never a silent broadening)', v_unresolved;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The steady-state student_matches_target: drops the p_target_type
--    parameter and the legacy dispatch, calls publication_target_matches_
--    offering directly. New 8-arg signature; the old 9-arg one is dropped in
--    step 4 once the policy/view are off it. LEFT JOIN + me.school_id check
--    kept exactly as 0196/#604 established it (an unenrolled Student still
--    reads scope='all', and can never match scope='offering'/'broadcast').

create function public.student_matches_target(
  p_target_scope text,
  p_school uuid,
  p_class_offering_id uuid,
  p_target_class_name text,
  p_target_academic_year int,
  p_target_shift text,
  p_target_group_department text,
  p_target_section text
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from students me
    left join student_enrollments se on se.id = me.current_enrollment_id
    left join class_offerings co on co.id = se.class_offering_id
    where me.profile_id = auth.uid()
      and me.archived_at is null
      and me.school_id = p_school
      and public.publication_target_matches_offering(
        p_target_scope, p_class_offering_id, p_target_class_name, p_target_academic_year,
        p_target_shift, p_target_group_department, p_target_section,
        co.id, co.name, co.academic_year, co.shift, co.group_department, co.section
      )
  )
$$;

revoke execute on function public.student_matches_target(
  text, uuid, uuid, text, int, text, text, text
) from anon, public;
grant execute on function public.student_matches_target(
  text, uuid, uuid, text, int, text, text, text
) to authenticated;

comment on function public.student_matches_target(
  text, uuid, uuid, text, int, text, text, text
) is
  'Whether the calling Student (auth.uid()) currently matches a publication''s '
  'target (issue #595, map #598) -- resolved via their CURRENT Enrollment''s '
  'Class Offering, delegating to the shared publication_target_matches_offering '
  'predicate. Takes the publication row''s own target columns, never an '
  'arbitrary Student id. As of Wave 7 (#608) the target_type/text fallback is '
  'gone -- target_scope is always populated.';

-- ---------------------------------------------------------------------------
-- 3. Repoint every consumer at the steady-state contract: a bare
--    `target_scope = 'all' OR <shared predicate>`, no target_type fast-path,
--    no scope-null dispatch. The cheap `target_scope = 'all'` outer check
--    stays (0196's note: student_matches_target is a SECURITY DEFINER
--    function Postgres cannot inline into the calling policy/view, so a
--    school-wide row must not pay for the subquery -- this codebase hit
--    exactly that regression in 0166/gl_lines).
--
-- CREATE OR REPLACE (not DROP + CREATE) for both views: the column list is
-- byte-for-byte unchanged, so the replace is legal and it preserves the
-- `grant select ... to authenticated` from 0141/0140. security_invoker /
-- security_barrier are respecified explicitly on every replace -- omitting
-- them silently resets to the default, the exact cause of a real
-- cross-tenant leak earlier in this map's work (Wave 4a, #587).

create or replace view public.student_material
  with (security_invoker = off, security_barrier = true) as
  select p.id,
    'publication'::text as source,
    p.kind,
    p.title,
    p.content,
    p.image_path as storage_path,
    null::text as file_name,
    p.link_url,
    p.created_at as posted_at,
    author.full_name as posted_by
   from publications p
     left join profiles author on author.id = p.created_by
  where p.kind = any (array['lesson_plan'::text, 'daily_lesson'::text, 'exam_prep'::text])
    and p.school_id = app_current_student_school_id()
    and (
      p.target_scope = 'all'
      or public.student_matches_target(
        p.target_scope, p.school_id, p.class_offering_id, p.target_class_name,
        p.target_academic_year, p.target_shift, p.target_group_department, p.target_section
      )
    )
  union all
  select cs.class_id as id,
    'syllabus'::text as source,
    'syllabus'::text as kind,
    cs.file_name as title,
    null::text as content,
    cs.storage_path,
    cs.file_name,
    null::text as link_url,
    cs.uploaded_at as posted_at,
    null::text as posted_by
   from class_syllabi cs
     join class_offerings c on c.id = cs.class_id
     join students me on me.profile_id = auth.uid() and me.archived_at is null and me.school_id = c.school_id
     join student_enrollments se on se.id = me.current_enrollment_id and se.class_offering_id = c.id;

create or replace view public.task_completion_roster with (security_invoker = on) as
  select p.id as publication_id,
         s.id as student_id,
         s.full_name,
         se.roll_number,
         co.name as class_name,
         co.section,
         c.completed_at
    from public.publications p
    join public.students s
      on s.school_id = p.school_id
     and s.archived_at is null
    left join public.student_enrollments se on se.id = s.current_enrollment_id
    left join public.class_offerings co on co.id = se.class_offering_id
    left join public.student_task_completions c
      on c.publication_id = p.id and c.student_id = s.id
   where p.target_scope = 'all'
      or public.publication_target_matches_offering(
        p.target_scope, p.class_offering_id, p.target_class_name, p.target_academic_year,
        p.target_shift, p.target_group_department, p.target_section,
        co.id, co.name, co.academic_year, co.shift, co.group_department, co.section
      );

comment on view public.task_completion_roster is
  'Every Student eligible for one Publication, left-joined to their completion '
  'row if any (map #568/#582 Wave 4a Part B, issue #587). Resolves every '
  'target via the shared publication_target_matches_offering predicate (map '
  '#598) -- as of Wave 7 (#608) the legacy (name, section)-text fallback is '
  'gone. An exact-Offering target correctly excludes a same-name-section '
  'Offering differing only by Shift/Year/Group Department -- the #593-class '
  'scenario this whole map exists to fix.';

comment on view public.student_material is
  'Student-visible lesson_plan/daily_lesson/exam_prep publications (targeting '
  'resolved via student_matches_target -> publication_target_matches_offering, '
  'map #598 Wave 7/#608) unioned with the caller''s own Class Offering syllabi.';

drop policy if exists "student reads targeted publications" on public.publications;
create policy "student reads targeted publications" on public.publications
  for select using (
    school_id = public.app_current_student_school_id()
    and (
      target_scope = 'all'
      or public.student_matches_target(
        target_scope, school_id, class_offering_id, target_class_name,
        target_academic_year, target_shift, target_group_department, target_section
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Now that nothing references them, drop the transitional scaffolding.

drop function if exists public.student_matches_target(text, text, uuid, uuid, text, int, text, text, text);
drop function if exists public.publication_target_matches_offering_any(
  text, text, uuid, text, int, text, text, text, uuid, text, int, text, text, text
);
drop function if exists public.publication_target_matches_offering_legacy(text, text, text, text, text);

-- ---------------------------------------------------------------------------
-- 5. Drop target_type and tighten target_scope.

-- publications_target_all_is_clean (0041, re-added by 0060) is the last
-- reference to target_type -- gated the pre-#595 "an 'all' row carries no
-- target columns" invariant, fully superseded by
-- publications_target_scope_all_valid (0195).
alter table public.publications drop constraint if exists publications_target_all_is_clean;
alter table public.publications drop column target_type;

-- 0195's column-level check was `target_scope is null or target_scope in (...)`
-- (auto-named publications_target_scope_check) -- the null-exempting
-- transitional form. Replace with the strict contract: NOT NULL, one of the
-- three real scopes. The three per-scope invariant CHECKs
-- (publications_target_scope_all_valid / _offering_valid / _broadcast_valid,
-- 0195) need no change -- they only ever fire once a row commits to a scope.
alter table public.publications drop constraint if exists publications_target_scope_check;
alter table public.publications alter column target_scope set not null;
alter table public.publications
  add constraint publications_target_scope_valid check (target_scope in ('all', 'offering', 'broadcast'));

comment on column public.publications.target_scope is
  'Issue #595, map #598: all/offering/broadcast -- the sole targeting '
  'discriminator. NOT NULL as of Wave 7 (#608); target_type (all/specific) '
  'and the transitional target_scope-is-null fallback are both gone. Every '
  'consumer resolves via publication_target_matches_offering (and its TS '
  'mirror targetMatchesOffering) -- no independent re-implementation anywhere.';
