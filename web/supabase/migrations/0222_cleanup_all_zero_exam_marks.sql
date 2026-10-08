-- DATA CHANGE — 0222_cleanup_all_zero_exam_marks.sql — issue #698 (migration index #703, row 3.4).
-- WRITTEN, NOT APPLIED. DELETES ROWS from public.exam_marks. Read the whole
-- header and run the PRE-CHECK before applying. No schema change to any
-- existing table; it creates one backup table.
--
-- What
--   Deletes exam_marks rows in which every component is 0, on exams that are
--   still OPEN and whose results are NOT published, and keeps a copy of every
--   deleted row in public.exam_marks_cleanup_698 so the delete can be undone.
--
-- Why
--   Before the marks-entry fix, opening a marks grid and pressing Save stored
--   every untouched cell as 0. Such a row cannot be told from a real zero. It
--   counts as "entered" (the exams list showed 26/28 with 8 real marks) and the
--   student reads as failed instead of incomplete.
--
-- Exactly which rows (all conditions must hold)
--   1. theory_obtained = 0 and mcq_obtained = 0 and practical_obtained = 0
--   2. the exam is open (exams.status = 'open')
--   3. the exam's results are not published (results_published_at is null)
--   4. the subject has full marks above 0 (a subject with no marks configured
--      can only hold zeros, so its rows say nothing either way)
--   5. the row was created before v_cutoff (below). Since the marks-entry fix
--      an all-zero row can only come from a teacher typing 0 in every cell, so
--      rows saved AFTER the fix went live must be kept. SET v_cutoff TO THE
--      TIME THE FIX WAS DEPLOYED. It defaults to now(), which is only correct
--      if this runs before, or at the same time as, that deploy.
--   6. the row is not marked absent (only checked when 0223 is already applied
--      and exam_marks.is_absent exists; an absent row is stored as zeros)
--   7. optional: the exam is in v_exam_ids, when the owner decides exam by exam
--      (null = every exam that meets 1–6)
--   Closed exams and published exams are NOT touched: a published zero has
--   been shown to a student, and a closed exam is a frozen record.
--
-- What it cannot know: a real zero (a student who sat the paper and scored 0 in
--   every component) on an open, unpublished exam is deleted too and must be
--   typed again. The pre-check lists every row so the owner can look first.
--
-- PRE-CHECK (read-only). Use the same cutoff as v_cutoff.
--   a) per exam — the report issue #698 asks for (step 1):
--     select s.name as school, e.id as exam_id, e.name as exam, e.exam_year,
--            e.status, e.results_published_at is not null as published,
--            count(*) as all_zero_rows,
--            count(*) filter (where e.status = 'open' and e.results_published_at is null
--                               and sub.theory_marks + sub.mcq_marks + sub.practical_marks > 0
--                               and m.created_at < now()) as rows_this_migration_deletes
--       from exam_marks m
--       join exams e on e.id = m.exam_id
--       join schools s on s.id = e.school_id
--       join subjects sub on sub.id = m.subject_id
--      where m.theory_obtained = 0 and m.mcq_obtained = 0 and m.practical_obtained = 0
--      group by s.name, e.id, e.name, e.exam_year, e.status, e.results_published_at
--      order by s.name, e.exam_year, e.name;
--   b) the exact rows:
--     select m.id, e.name as exam, sub.name as subject, st.full_name, st.roll_number, m.created_at
--       from exam_marks m
--       join exams e on e.id = m.exam_id
--       join subjects sub on sub.id = m.subject_id
--       join students st on st.id = m.student_id
--      where m.theory_obtained = 0 and m.mcq_obtained = 0 and m.practical_obtained = 0
--        and e.status = 'open' and e.results_published_at is null
--        and sub.theory_marks + sub.mcq_marks + sub.practical_marks > 0
--        and m.created_at < now()
--      order by e.name, sub.name, st.roll_number;
--   (If 0223 is applied first, add "and not m.is_absent" to both.)
--
-- Expected change: exam_marks loses exactly the rows of query (b);
--   exam_marks_cleanup_698 gains the same number. The migration prints the
--   count (raise notice). The exams list progress falls for those exams and the
--   students read as "incomplete" / "marks not entered" instead of failed.
--
-- Rollback (puts the rows back, then removes the backup)
--   insert into public.exam_marks
--     (id, exam_id, school_id, student_id, subject_id,
--      theory_obtained, mcq_obtained, practical_obtained, entered_by, created_at)
--   select id, exam_id, school_id, student_id, subject_id,
--          theory_obtained, mcq_obtained, practical_obtained, entered_by, created_at
--     from public.exam_marks_cleanup_698
--   on conflict (exam_id, student_id, subject_id) do nothing;
--   -- "do nothing": a mark typed for that student since the cleanup is kept.
--   -- An exam closed since then refuses the insert (exam is closed); reopen is
--   -- not possible, so restore before closing.
--   drop table if exists public.exam_marks_cleanup_698;
--
-- Idempotent: a second run finds no matching rows (or only new ones, see 5).

create table if not exists public.exam_marks_cleanup_698 (
  id uuid primary key,
  exam_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  subject_id uuid not null,
  theory_obtained numeric(6, 2),
  mcq_obtained numeric(6, 2),
  practical_obtained numeric(6, 2),
  entered_by uuid,
  created_at timestamptz,
  removed_at timestamptz not null default now()
);
-- Backup only: no policy, so no API role reads or writes it.
alter table public.exam_marks_cleanup_698 enable row level security;
revoke all on public.exam_marks_cleanup_698 from anon, authenticated;

do $$
declare
  -- EDIT BEFORE APPLYING (see condition 5 and 7 above).
  v_cutoff   timestamptz := now();
  v_exam_ids uuid[]      := null;
  v_absent   text        := '';
  v_deleted  int;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'exam_marks' and column_name = 'is_absent'
  ) then
    v_absent := ' and not m.is_absent';
  end if;

  execute format($q$
    with gone as (
      delete from public.exam_marks m
       using public.exams e, public.subjects sub
       where e.id = m.exam_id
         and sub.id = m.subject_id
         and m.theory_obtained = 0 and m.mcq_obtained = 0 and m.practical_obtained = 0
         and e.status = 'open'
         and e.results_published_at is null
         and sub.theory_marks + sub.mcq_marks + sub.practical_marks > 0
         and m.created_at < $1
         and ($2 is null or m.exam_id = any ($2))
         %s
      returning m.id, m.exam_id, m.school_id, m.student_id, m.subject_id,
                m.theory_obtained, m.mcq_obtained, m.practical_obtained, m.entered_by, m.created_at
    )
    insert into public.exam_marks_cleanup_698
      (id, exam_id, school_id, student_id, subject_id,
       theory_obtained, mcq_obtained, practical_obtained, entered_by, created_at)
    select * from gone
    on conflict (id) do nothing
  $q$, v_absent) using v_cutoff, v_exam_ids;

  get diagnostics v_deleted = row_count;
  raise notice '0222: % all-zero exam_marks rows deleted and backed up', v_deleted;
end $$;

notify pgrst, 'reload schema';
