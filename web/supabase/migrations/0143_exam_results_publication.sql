-- 0143_exam_results_publication.sql
-- Map #434 / tickets #440 + #449: results become publishable, and a Student
-- reads their own — published exams only.
--
-- Closed and Published are different questions and 0143 keeps them apart, per
-- the decision on #440. Closed freezes the record and is one-way; publishing
-- controls an audience and is reversible, because a school that spots a marking
-- error after publishing must be able to pull results back.

alter table public.exams add column if not exists results_published_at timestamptz;

create index if not exists exams_published_idx
  on public.exams (school_id, results_published_at) where results_published_at is not null;

-- ---------------------------------------------------------------------------
-- The Student's own results, resolved.
--
-- One definer view again, for the same reason as student_routine: a Student
-- needs their marks with subject names attached, and nothing else about exams,
-- subjects or other students' marks. The publication gate lives HERE, once, so
-- no screen can forget it.
--
-- Rank is deliberately absent from this view. It is computed by rankResults in
-- lib/exam-results.ts over the whole class, which needs marks this Student may
-- not read — so rank arrives through its own definer function below rather than
-- by opening the class's marks to them.
drop view if exists public.student_exam_result;
create view public.student_exam_result with (security_invoker = off, security_barrier = true) as
  select e.id                as exam_id,
         e.name              as exam_name,
         e.exam_year,
         e.results_published_at,
         e.grading_scheme_id,
         sub.id              as subject_id,
         sub.name            as subject_name,
         sub.theory_marks    as subject_theory_total,
         sub.mcq_marks       as subject_mcq_total,
         sub.practical_marks as subject_practical_total,
         m.theory_obtained,
         m.mcq_obtained,
         m.practical_obtained,
         m.obtained_marks
    from public.exam_marks m
    join public.exams e   on e.id = m.exam_id
    join public.subjects sub on sub.id = m.subject_id
    join public.students me
      on me.id = m.student_id
     and me.profile_id = auth.uid()
     and me.archived_at is null
   where e.results_published_at is not null;

grant select on public.student_exam_result to authenticated;

-- ---------------------------------------------------------------------------
-- Class rank, without opening the class's marks.
--
-- Publishing a child's position in class was a real decision, not a technical
-- one (#440): it is included because the printed mark sheet the school already
-- hands the child carries it, and showing it on paper while hiding it in the
-- portal would be incoherent.
--
-- Returns the caller's own rank only. The totals it ranks over are every
-- student's, which is precisely why this is a definer function returning one
-- integer rather than a view a Student could select the whole class from.
create or replace function public.student_exam_rank(p_exam uuid)
returns table (rank int, out_of int)
language sql stable security definer set search_path = public as $$
  with me as (
    select id, school_id from students
     where profile_id = auth.uid() and archived_at is null
  ),
  published as (
    select e.id from exams e
     where e.id = p_exam and e.results_published_at is not null
       and e.school_id = (select school_id from me)
  ),
  totals as (
    select m.student_id, sum(coalesce(m.obtained_marks, 0)) as total
      from exam_marks m
     where m.exam_id = (select id from published)
     group by m.student_id
  ),
  ranked as (
    select student_id, rank() over (order by total desc) as rank,
           count(*) over () as out_of
      from totals
  )
  select r.rank::int, r.out_of::int
    from ranked r where r.student_id = (select id from me);
$$;

revoke execute on function public.student_exam_rank(uuid) from anon;
grant execute on function public.student_exam_rank(uuid) to authenticated;
