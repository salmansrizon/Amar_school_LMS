-- 0223_exam_marks_absent_and_atomic_save.sql — issues #679 and #700
-- (migration index #703, rows 3.1 and 3.2: "do together, same code").
-- WRITTEN, NOT APPLIED. The app works with and without it.
--
-- What
--   1. exam_marks.theory_obtained / mcq_obtained / practical_obtained become
--      NULLABLE. NULL = that component is not entered yet.
--   2. exam_marks.is_absent boolean not null default false: the student was
--      absent for this subject's paper.
--   3. A CHECK that an absent row holds 0 in all three components.
--   4. public.save_exam_marks(p_exam, p_subject, p_rows, p_cleared): the marks
--      grid's whole save (upsert of changed rows + delete of cleared rows) in
--      ONE function call, so one save is one transaction (#700).
--
-- Why
--   #679: "absent" could not be told from "not entered", and a half-filled row
--   (theory today, MCQ later) was refused because a blank could not be stored.
--   #700: the save ran an upsert and then a delete; if the delete failed the
--   upsert had already been applied.
--
-- The rules the app follows after this migration (decisions, see
--   docs/handoff/migrations-exams-rollout.md):
--   - Absent is recorded per student PER SUBJECT (the row is per subject).
--   - An absent row counts as ENTERED with 0 marks: the student fails that
--     subject, as when a teacher typed 0 before. It is stored as zeros so that
--     obtained_marks, student_exam_rank and every existing total keep working.
--   - A row with a NULL component is NOT entered yet. obtained_marks is a
--     generated column (theory + mcq + practical), so it is NULL for exactly
--     those rows; the app counts a row as entered only when obtained_marks is
--     not null. Result book, promotion and mark sheet show such a student as
--     "incomplete", never failed.
--   - A component the subject does not have (maximum 0) is still stored 0.
--
-- The function is SECURITY INVOKER on purpose: row level security (school and
--   the Exams Permission Grant), enforce_exam_mark_school (same school, closed
--   exam) and the delete guard stay the authority, exactly as for the two
--   statements it replaces. It grants nobody anything they could not already
--   write. It does not check a mark against the subject's maximum: the table
--   never did, and the app's save action does.
--
-- Not changed: the columns' DEFAULT 0 stays (an insert that names only one
--   component still stores 0 for the others, as today), the generated
--   obtained_marks column, every policy and trigger, student_exam_result and
--   student_exam_rank.
--
-- Effect on existing data: none. No row is rewritten. Dropping NOT NULL cannot
--   fail. Every existing row gets is_absent = false, which satisfies the CHECK.
--
-- PRE-CHECK (read-only)
--   a) the three columns are still NOT NULL and is_absent does not exist yet:
--     select column_name, is_nullable, column_default, generation_expression
--       from information_schema.columns
--      where table_schema = 'public' and table_name = 'exam_marks'
--      order by ordinal_position;
--   b) no function of this name exists with another signature:
--     select oid::regprocedure from pg_proc where proname = 'save_exam_marks';
--   c) rows today, for comparison afterwards (must not change):
--     select count(*) as rows, count(obtained_marks) as rows_with_total from exam_marks;
--
-- Rollback — in this order. Step 3 needs a decision if teachers have saved
--   half-filled rows since the migration, because NOT NULL cannot come back
--   while NULLs exist.
--   1. drop function if exists public.save_exam_marks(uuid, uuid, jsonb, uuid[]);
--      (the app falls back to its two-statement save at once)
--   2. alter table public.exam_marks drop constraint if exists exam_marks_absent_is_zero;
--      alter table public.exam_marks drop column if exists is_absent;
--      (absent rows stay as all-zero rows, which read as 0 marks, as before)
--   3. see the half-filled rows:
--        select count(*) from public.exam_marks where obtained_marks is null;
--      then EITHER delete them (they read as "not entered", the typed part is lost):
--        delete from public.exam_marks where obtained_marks is null;
--      OR keep the typed part and store 0 for the blank part (reads as entered):
--        update public.exam_marks
--           set theory_obtained = coalesce(theory_obtained, 0),
--               mcq_obtained = coalesce(mcq_obtained, 0),
--               practical_obtained = coalesce(practical_obtained, 0)
--         where obtained_marks is null;
--      (both need the exam to be open; a closed exam refuses the write)
--   4. alter table public.exam_marks
--        alter column theory_obtained set not null,
--        alter column mcq_obtained set not null,
--        alter column practical_obtained set not null;
--   5. notify pgrst, 'reload schema';
-- Idempotent.

alter table public.exam_marks
  alter column theory_obtained drop not null,
  alter column mcq_obtained drop not null,
  alter column practical_obtained drop not null,
  add column if not exists is_absent boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'exam_marks_absent_is_zero' and conrelid = 'public.exam_marks'::regclass
  ) then
    -- coalesce: a NULL component must fail the check, not slip through it.
    alter table public.exam_marks add constraint exam_marks_absent_is_zero
      check (not is_absent
             or coalesce(theory_obtained = 0 and mcq_obtained = 0 and practical_obtained = 0, false));
  end if;
end $$;

-- p_rows: [{"student_id": uuid, "theory": number|null, "mcq": number|null,
--           "practical": number|null, "is_absent": boolean}, ...]
-- p_cleared: students whose row for this exam and subject is removed.
-- A function call is one transaction: the upsert and the delete succeed or
-- fail together.
create or replace function public.save_exam_marks(
  p_exam uuid,
  p_subject uuid,
  p_rows jsonb,
  p_cleared uuid[]
) returns void
language sql security invoker set search_path = public as $$
  insert into exam_marks
    (exam_id, subject_id, student_id, theory_obtained, mcq_obtained, practical_obtained, is_absent)
  select p_exam, p_subject, r.student_id, r.theory, r.mcq, r.practical, coalesce(r.is_absent, false)
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
         as r(student_id uuid, theory numeric, mcq numeric, practical numeric, is_absent boolean)
  on conflict (exam_id, student_id, subject_id) do update
    set theory_obtained = excluded.theory_obtained,
        mcq_obtained = excluded.mcq_obtained,
        practical_obtained = excluded.practical_obtained,
        is_absent = excluded.is_absent;

  delete from exam_marks
   where exam_id = p_exam
     and subject_id = p_subject
     and student_id = any (coalesce(p_cleared, '{}'::uuid[]));
$$;

revoke execute on function public.save_exam_marks(uuid, uuid, jsonb, uuid[]) from public;
revoke execute on function public.save_exam_marks(uuid, uuid, jsonb, uuid[]) from anon;
grant execute on function public.save_exam_marks(uuid, uuid, jsonb, uuid[]) to authenticated;
grant execute on function public.save_exam_marks(uuid, uuid, jsonb, uuid[]) to service_role;

notify pgrst, 'reload schema';
