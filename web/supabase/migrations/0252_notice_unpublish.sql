-- 0252_notice_unpublish.sql
-- Issue #696 (#703 item 5.1): unpublish and republish a notice.
-- DRAFT: written by an agent, applied by hand after review. One nullable
-- column, one CHECK, one policy replaced. No row is rewritten or deleted.
-- Safe to run twice.
--
-- WHAT
--   1. publications.unpublished_at timestamptz, null by default.
--      NULL = published (every existing row). A time = taken down at that time.
--   2. CHECK publications_unpublish_notice_only: only a row of kind 'notice'
--      may carry unpublished_at.
--   3. Policy "student reads targeted publications": the 0198 expression plus
--      `unpublished_at is null`.
--
-- WHY
--   A published notice could only be taken down by deleting it.
--
-- CHOICES (the conservative ones; say so if another is wanted)
--   * `unpublished_at`, not `status` or a nullable `published_at`: every
--     existing row is already correct with NULL, so nothing is backfilled.
--   * Republish sets unpublished_at back to NULL and keeps created_at, so a
--     republished notice keeps its original date and place in the list.
--   * Notices only. Homework and study material reach the Student through the
--     definer views student_task and student_material (0198), which this file
--     does not touch; the CHECK keeps an unpublished_at from being set on a
--     row those views would still show.
--   * Gallery albums are not covered.
--
-- WHO MAY READ WHAT
--   A Student reads publications only through the one policy below. It is the
--   0198 policy (own School via app_current_student_school_id(), and the
--   notice targets the Student) with one more AND, so it can only return
--   fewer rows than before, never more. Staff policies are not changed: the
--   School still sees its unpublished notices and can republish them.
--   Writing unpublished_at is covered by the existing "school members manage
--   publications" policy (0041); a Student has no write policy on this table.
--
-- EFFECT ON EXISTING DATA
--   None. All rows get NULL (no table rewrite: a nullable column without a
--   default). The CHECK holds for all of them by construction. Students see
--   exactly what they saw before until a notice is unpublished.
--
-- THE APP BEFORE AND AFTER
--   Before: the owner pages read without the column (they retry on 42703 /
--   PGRST204) and show no Unpublish button; the action returns "not available
--   yet". After: status chip, Unpublish / Republish on notices.
--
-- PRE-CHECK (read-only)
--   -- 1. Column absent (expect no rows):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'publications' and column_name = 'unpublished_at';
--   -- 2. The student policy is still the 0198 one (compare the expression
--   --    with the ROLLBACK block; if it differs, a later migration changed it
--   --    and section 3 below must be rebased on that text first):
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'publications' order by policyname;
--   -- 3. How many notices a Student-facing read covers today (unchanged after):
--   select kind, count(*) from publications group by kind order by kind;
--
-- ROLLBACK (in this order: the policy names the column, so it is restored
-- first; stored unpublish times are lost and those notices become visible
-- to Students again)
--   drop policy if exists "student reads targeted publications" on public.publications;
--   create policy "student reads targeted publications" on public.publications
--     for select using (
--       school_id = public.app_current_student_school_id()
--       and (
--         target_scope = 'all'
--         or public.student_matches_target(
--           target_scope, school_id, class_offering_id, target_class_name,
--           target_academic_year, target_shift, target_group_department, target_section
--         )
--       )
--     );
--   alter table public.publications drop constraint if exists publications_unpublish_notice_only;
--   alter table public.publications drop column if exists unpublished_at;
--   notify pgrst, 'reload schema';

-- 1. The column.
alter table public.publications add column if not exists unpublished_at timestamptz;

comment on column public.publications.unpublished_at is
  'NULL = published. Set = the notice was taken down at that time and Students no longer read it (issue #696). Notices only.';

-- 2. Notices only. Every existing row has NULL, so this cannot fail on them.
alter table public.publications drop constraint if exists publications_unpublish_notice_only;
alter table public.publications
  add constraint publications_unpublish_notice_only check (unpublished_at is null or kind = 'notice');

-- 3. The Student read policy: 0198's expression AND published.
drop policy if exists "student reads targeted publications" on public.publications;
create policy "student reads targeted publications" on public.publications
  for select using (
    school_id = public.app_current_student_school_id()
    and unpublished_at is null
    and (
      target_scope = 'all'
      or public.student_matches_target(
        target_scope, school_id, class_offering_id, target_class_name,
        target_academic_year, target_shift, target_group_department, target_section
      )
    )
  );

notify pgrst, 'reload schema';
