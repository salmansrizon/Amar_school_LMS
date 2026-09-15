-- 0202_class_offerings_archive.sql
-- Issue #631 / ADR 0024.
--
-- Deleting a Class Offering with enrollment history has always failed with a
-- raw Postgres FK-violation error (student_enrollments_class_offering_id_fkey
-- has no ON DELETE clause, deliberately — see ADR 0024 for why relaxing it to
-- CASCADE or SET NULL was rejected: it would destroy or corrupt Student
-- enrollment history). The fix is a lifecycle rule, not a relaxed FK: a Class
-- Offering that has never been used stays permanently deletable; one that has
-- can only be Archived, the same reversible archived_at toggle already used
-- for Students and Employees.
--
-- "Used" is broader than just enrollment (grilled explicitly, school owner
-- Mahbubur Rahman Khan): any row in ANY of the nine tables that reference a
-- Class Offering counts — configured-but-unenrolled setup work (subjects, a
-- fee structure, a routine) is real work too, not just enrollment history.

alter table public.class_offerings
  add column archived_at timestamptz;

create index class_offerings_archived_idx on public.class_offerings (school_id, archived_at);

-- The single source of truth for "used" — every UI decision (which button to
-- show) and every server-side guard (the delete action's own defense-in-depth
-- re-check) calls this, so the two can never disagree. SECURITY DEFINER
-- deliberately: several of these nine tables are gated behind their own
-- screen-specific Permission Grant (Fees, Exams — see CONTEXT.md's
-- Permission Grant entry), so a caller without one of those grants must still
-- get a correct answer, not a false "unused" from an RLS-empty read.
--
-- The school_id = app_current_school_id() guard below is load-bearing, not
-- decorative: because this is SECURITY DEFINER and directly client-callable
-- (not only reached from actions.ts), an id belonging to another School must
-- resolve to false, the same tenant boundary class_offerings_used_ids()
-- below already enforces by deriving the School from the caller's own
-- session rather than trusting a passed-in value.
create or replace function public.class_offering_is_used(p_class_offering_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_offerings co
    where co.id = p_class_offering_id
      and co.school_id = public.app_current_school_id()
      and (
        exists (select 1 from public.student_enrollments se where se.class_offering_id = co.id)
        or exists (select 1 from public.subjects s where s.class_id = co.id)
        or exists (select 1 from public.fee_structures f where f.class_id = co.id)
        or exists (select 1 from public.routine_slots r where r.class_offering_id = co.id)
        or exists (select 1 from public.class_routines cr where cr.class_id = co.id)
        or exists (select 1 from public.class_syllabi cs where cs.class_id = co.id)
        or exists (select 1 from public.exams e where e.class_id = co.id)
        or exists (select 1 from public.exam_combinations ec where ec.class_id = co.id)
        -- Publications: an 'offering'-scope target names this row by id
        -- directly. A 'broadcast'-scope target names no id at all (map #598
        -- — see CONTEXT.md's Publication Target entry) — it is a live
        -- predicate matched by class name/year/shift/group/section, so it is
        -- matched here the same way, field for field. Deliberately EXCLUDES
        -- 'all'-scope publications: "reaches every Offering in the School"
        -- is not the same claim as "real work was done against THIS
        -- Offering specifically" — counting it would make every Offering
        -- permanently "used" the moment a School sends even one school-wide
        -- Notice, which defeats the point of this check. Not a call to
        -- public.publication_target_matches_offering(): that function's own
        -- 'all' branch unconditionally returns true, exactly the case this
        -- check must not count.
        or exists (
          select 1
          from public.publications p
          where (p.target_scope = 'offering' and p.class_offering_id = co.id)
             or (
               p.target_scope = 'broadcast'
               and p.target_class_name is not distinct from co.name
               and p.target_academic_year is not distinct from co.academic_year
               and (p.target_shift is null or p.target_shift is not distinct from co.shift)
               and (
                 p.target_group_department is null
                 or p.target_group_department is not distinct from co.group_department
               )
               and (p.target_section is null or p.target_section is not distinct from co.section)
             )
        )
      )
  )
$$;

revoke execute on function public.class_offering_is_used(uuid) from anon;
grant execute on function public.class_offering_is_used(uuid) to authenticated;

comment on function public.class_offering_is_used(uuid) is
  'Whether a Class Offering has ever been used (ADR 0024) -- at least one '
  'row in student_enrollments, subjects, fee_structures, routine_slots, '
  'class_routines, class_syllabi, exams, exam_combinations or publications '
  'references it. A used Offering can only be Archived, never permanently '
  'deleted from the UI.';

-- The list-view twin of class_offering_is_used: every used id in the
-- caller's own School, one round trip instead of N. Zero-argument + definer,
-- same shape as app_current_employee_id()/student_current_class_offering_id()
-- -- deriving the School from the caller's own session rather than trusting a
-- passed-in school_id keeps a SECURITY DEFINER function from ever answering
-- for a School the caller doesn't belong to.
create or replace function public.class_offerings_used_ids()
returns table(class_offering_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select co.id
  from public.class_offerings co
  where co.school_id = public.app_current_school_id()
    and public.class_offering_is_used(co.id)
$$;

revoke execute on function public.class_offerings_used_ids() from anon;
grant execute on function public.class_offerings_used_ids() to authenticated;

comment on function public.class_offerings_used_ids() is
  'Every used Class Offering id (see class_offering_is_used) in the calling '
  'user''s own School -- backs the Class & Curriculum list''s Delete-vs-'
  'Archive button choice without one RPC call per row.';
