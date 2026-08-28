-- 0165_a_subject_is_unique_within_its_class.sql
-- Map #524 / ticket #535: the student question form offered `XS1 Physics` 25
-- times, and a child picking one could not tell which was which.
--
-- Not an unscoped join, which is what the UAT report inferred. The table really
-- holds 25 rows with that name in one school: `subjects` carries no uniqueness of
-- any kind, so every re-run of a fixture inserted another copy. A duplicate here
-- is not cosmetic — the question routes to whichever row was picked, and each is
-- a different subject_id with a different set of exam entries hanging off it.
--
-- Scope is (school_id, class_id, name): class_id is nullable, so a school-wide
-- subject and a class-scoped one of the same name are legitimately different rows,
-- and two school-wide ones are not. NULLS NOT DISTINCT (PG15+, this is 17.6) is
-- what makes the school-wide case actually collide — the default NULLS DISTINCT
-- would let unlimited copies through with class_id null, which is the exact shape
-- of the 25 rows.
--
-- lower(name) because staging already holds casing variants of other free-text
-- columns ('father' and 'Father' in students.guardian_relation), and "Physics"
-- beside "physics" in a dropdown is the same defect wearing a hat.

-- ---------------------------------------------------------------------------
-- 1. Repoint what points at a duplicate.
--
-- Of the six tables with a subjects FK, only exam_routine_entries references any
-- loser here (12 rows). It carries UNIQUE (exam_id, subject_id), so a repoint can
-- collide in principle; verified before writing this that no (exam_id, survivor)
-- pair collapses to more than one row, and the ON CONFLICT is kept anyway so this
-- migration is safe on an environment where that is not true.
create temporary table subject_dedupe on commit drop as
  select id,
         first_value(id) over (partition by school_id, class_id, lower(name) order by created_at, id) as survivor
    from subjects;

update exam_routine_entries e
   set subject_id = d.survivor
  from subject_dedupe d
 where d.id = e.subject_id
   and d.survivor <> e.subject_id
   and not exists (
     select 1 from exam_routine_entries x
      where x.exam_id = e.exam_id and x.subject_id = d.survivor
   );

-- Anything that would still collide is a duplicate row of a duplicate subject.
delete from exam_routine_entries e
 using subject_dedupe d
 where d.id = e.subject_id and d.survivor <> e.subject_id;

-- The remaining five FK tables have no rows pointing at a loser today; repoint
-- them anyway rather than assuming, so this is correct wherever it is applied.
update routine_slots r set subject_id = d.survivor
  from subject_dedupe d where d.id = r.subject_id and d.survivor <> r.subject_id;
update student_messages m set subject_id = d.survivor
  from subject_dedupe d where d.id = m.subject_id and d.survivor <> m.subject_id;
update student_subjects s set subject_id = d.survivor
  from subject_dedupe d where d.id = s.subject_id and d.survivor <> s.subject_id
   and not exists (select 1 from student_subjects x where x.student_id = s.student_id and x.subject_id = d.survivor);
delete from student_subjects s using subject_dedupe d
 where d.id = s.subject_id and d.survivor <> s.subject_id;
update exam_marks m set subject_id = d.survivor
  from subject_dedupe d where d.id = m.subject_id and d.survivor <> m.subject_id
   and not exists (select 1 from exam_marks x
                    where x.exam_id = m.exam_id and x.student_id = m.student_id and x.subject_id = d.survivor);
delete from exam_marks m using subject_dedupe d
 where d.id = m.subject_id and d.survivor <> m.subject_id;
update exam_subject_teachers t set subject_id = d.survivor
  from subject_dedupe d where d.id = t.subject_id and d.survivor <> t.subject_id
   and not exists (select 1 from exam_subject_teachers x
                    where x.exam_id = t.exam_id and x.subject_id = d.survivor);
delete from exam_subject_teachers t using subject_dedupe d
 where d.id = t.subject_id and d.survivor <> t.subject_id;

-- ---------------------------------------------------------------------------
-- 2. Drop the duplicates themselves.
delete from subjects s using subject_dedupe d where d.id = s.id and d.survivor <> s.id;

-- ---------------------------------------------------------------------------
-- 3. Make it unrepresentable, so the next fixture re-run cannot recreate it.
create unique index if not exists subjects_unique_per_class
  on public.subjects (school_id, class_id, lower(name))
  nulls not distinct;
