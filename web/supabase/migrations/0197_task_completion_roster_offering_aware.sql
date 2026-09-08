-- 0197_task_completion_roster_offering_aware.sql
-- Issue #595, map #598 Wave 3 (#604) -- task_completion_roster (0140,
-- Enrollment-aware since 0188) independently re-implemented the same
-- (name, section)-text targeting rule student_matches_target() carries,
-- and had already silently drifted from it once (#601's own discovery
-- pass caught this map's namesake bug recurring in a second consumer).
-- Moves it onto the same shared predicate Wave 2 (#603) already wired
-- student_matches_target() to, closing the drift for real this time --
-- one authoritative rule, not two independently hand-maintained copies.
--
-- Calls the shared dispatch function (publication_target_matches_offering_
-- any, extracted in 0196 specifically because this view needed the exact
-- same target_scope-is-null-vs-populated dispatch student_matches_target
-- does) rather than hand-rolling the same if/else here a second time --
-- caught by code review as the identical drift-risk class of bug (#601)
-- this whole migration series exists to close, recurring one level up from
-- where 0196 had just closed it. Wave 7 (#608) simplifies the dispatch
-- function itself once every writer populates target_scope directly; this
-- view needs no change when that happens.
--
-- No extra "co.id is not null" guard needed for the delegate call: a
-- Student with no current Enrollment already has co.* all null via the
-- existing LEFT JOINs, and publication_target_matches_offering returns true
-- unconditionally for scope='all' regardless of the candidate Offering's
-- fields (an unenrolled Student still belongs to "every Student in the
-- school"). For 'offering'/'broadcast', an unenrolled Student's null co.id/
-- co.name correctly fails to match -- but only because
-- publication_target_matches_offering's own 'offering' branch now requires
-- p_offering_id IS NOT NULL explicitly (0195, fixed by code review): `NULL
-- IS NOT DISTINCT FROM NULL` is TRUE, so without that explicit guard, an
-- unenrolled Student would have silently matched any 'offering'-scoped
-- target whose own class_offering_id had also gone null (the deliberate
-- post-deletion state, #599) -- a real, if narrow, authorization gap this
-- view would otherwise have reintroduced independently of student_matches_
-- target, caught end-to-end by task-completion-roster.test.ts's own
-- unenrolled-Student case.
--
-- security_invoker=on reapplied explicitly -- omitting it on a CREATE OR
-- REPLACE VIEW silently resets it to the default, the exact mistake that
-- caused a real cross-tenant leak on this same view earlier in this map's
-- work (Wave 4a, #587). Never omit it here.
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
   where p.target_type = 'all'
      or p.target_scope = 'all'
      or public.publication_target_matches_offering_any(
        p.target_scope, p.target_type, p.class_offering_id, p.target_class_name, p.target_academic_year,
        p.target_shift, p.target_group_department, p.target_section,
        co.id, co.name, co.academic_year, co.shift, co.group_department, co.section
      );

grant select on public.task_completion_roster to authenticated;

comment on view public.task_completion_roster is
  'Every Student eligible for one Publication, left-joined to their '
  'completion row if any (map #568/#582 Wave 4a Part B, issue #587). As of '
  'map #598 Wave 3 (#604), resolves target_scope=''offering''/''broadcast'' '
  'rows via the shared publication_target_matches_offering predicate '
  '(same rule student_matches_target uses, #603) -- an exact-Offering '
  'target now correctly excludes a same-name-section Offering differing '
  'only by Shift/Year/Group Department, the #593-class scenario this whole '
  'map exists to fix. Falls back to publication_target_matches_offering_'
  'legacy for a not-yet-migrated (target_scope is null) row, shared with '
  'student_matches_target''s own fallback rather than a third independent '
  'copy. Removed in Wave 7 (#608).';
