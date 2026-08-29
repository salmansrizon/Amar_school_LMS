-- 0167_one_exam_per_name_and_one_pending_correction.sql
-- Map #524 / ticket #536: "student exam schedule showed repeated copies of one
-- exam" and "profile request history contains repeated requests for the same
-- value".
--
-- Two findings that look alike and are not.

-- ---------------------------------------------------------------------------
-- 1. Exams — the same defect as #535's subjects, one table over.
--
-- `exams` carries a primary key and nothing else: no uniqueness on
-- (school_id, name, exam_year). Twelve rows named 'XS1 Finals 2026' existed in
-- one school, each with its own id and its own routine entry, so a student's exam
-- list showed the same exam twelve times and each entry pointed at different
-- scheduling data. Zero marks on any of them, which is the only reason this is
-- cleanable rather than a data-loss decision.
create temporary table exam_dedupe on commit drop as
  select id,
         first_value(id) over (partition by school_id, lower(name), exam_year order by created_at, id) as survivor
    from exams;

-- exam_routine_entries carries UNIQUE (exam_id, subject_id). The duplicates all
-- schedule the same subject, so repointing collapses them onto one row; whatever
-- would collide is a duplicate of a duplicate and goes.
update exam_routine_entries e
   set exam_id = d.survivor
  from exam_dedupe d
 where d.id = e.exam_id and d.survivor <> e.exam_id
   and not exists (
     select 1 from exam_routine_entries x
      where x.exam_id = d.survivor and x.subject_id = e.subject_id
   );
delete from exam_routine_entries e using exam_dedupe d
 where d.id = e.exam_id and d.survivor <> e.exam_id;

-- The remaining exam children repoint the same way. Written for correctness
-- wherever this runs, not just against the rows that exist here today.
update exam_marks m set exam_id = d.survivor
  from exam_dedupe d where d.id = m.exam_id and d.survivor <> m.exam_id
   and not exists (select 1 from exam_marks x
                    where x.exam_id = d.survivor and x.student_id = m.student_id and x.subject_id = m.subject_id);
delete from exam_marks m using exam_dedupe d where d.id = m.exam_id and d.survivor <> m.exam_id;

update exam_subject_teachers t set exam_id = d.survivor
  from exam_dedupe d where d.id = t.exam_id and d.survivor <> t.exam_id
   and not exists (select 1 from exam_subject_teachers x
                    where x.exam_id = d.survivor and x.subject_id = t.subject_id);
delete from exam_subject_teachers t using exam_dedupe d where d.id = t.exam_id and d.survivor <> t.exam_id;

delete from exams e using exam_dedupe d where d.id = e.id and d.survivor <> e.id;

create unique index if not exists exams_unique_per_year
  on public.exams (school_id, lower(name), exam_year);

-- ---------------------------------------------------------------------------
-- 2. Profile corrections — NOT the same defect, and not deduped.
--
-- 16 requests exist, 15 of them `applied` with the same value for one student.
-- Deleting those would be wrong: an applied request is a record of a change that
-- actually happened to a child's record, and a student may legitimately correct
-- the same field more than once over time. History repeating is not duplication.
--
-- What should be impossible is queueing the same correction twice while one is
-- still waiting — that is what puts two identical rows in front of an Owner with
-- no way to tell them apart, and what lets a student submit fifteen times.
--
-- Partial, so it constrains only the pending queue and leaves history alone.
create unique index if not exists one_pending_correction_per_field
  on public.student_profile_change_requests (student_id, field)
  where status = 'pending';
