-- apply-wave2.sql — built 2026-10-08 from web/supabase/migrations on merge/staging-sync.
-- Run ONCE in the Supabase SQL editor of the LMS project. One transaction:
-- if any statement fails, nothing is applied.
--
-- Files, in order: 0221, 0223, 0224, 0231, 0232, 0240, 0241, 0243, 0244, 0245, 0252, 0253, 0254, 0255, 0256, 0257.
-- Left out on purpose: 0242 (optional; redefines app_current_school_id()).
-- Already applied: 0217, 0218, 0219, 0220, 0230, 0250, 0251.
-- Rollback SQL for each file is in that file's header (kept below) and in
-- docs/handoff/migrations-{exams,fees,access,notices-portal}-rollout.md.

begin;

-- Guard: stop before changing anything if the database is not in the state
-- these files were checked against (read-only checks, 2026-10-08).
do $guard$
begin
  if not (pg_get_functiondef('public.is_absent_working_day(uuid,uuid,date)'::regprocedure) like '%weekly_off_days%') then
    raise exception 'guard: 0218 is not applied';
  end if;
  if exists (select 1 from public.fee_collection_records group by student_id, month, year having count(*) > 1) then
    raise exception 'guard: duplicate fee records per student/month/year';
  end if;
  if exists (select 1 from public.student_messages where char_length(body) > 4000) then
    raise exception 'guard: a question is longer than 4000 characters';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'publications'
                  and policyname = 'student reads targeted publications' and qual not like '%unpublished_at%') then
    raise exception 'guard: publications student policy is not the expected one';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workflow_instances'
                  and policyname = 'members read own instances') then
    raise exception 'guard: workflow_instances policy is not the expected one';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and ((table_name = 'exam_marks' and column_name = 'is_absent')
                or (table_name = 'fee_collection_records' and column_name = 'void_at')
                or (table_name = 'profiles' and column_name = 'login_disabled_at')
                or (table_name = 'publications' and column_name = 'unpublished_at')
                or (table_name = 'student_messages' and column_name = 'thread_id'))) then
    raise exception 'guard: part of this file is already applied';
  end if;
end
$guard$;

-- ===========================================================================
-- FILE 0221_student_reads_grading_scheme.sql
-- ===========================================================================
-- 0221_student_reads_grading_scheme.sql — issue #702 (migration index #703, row 1.2).
-- WRITTEN, NOT APPLIED. The app works with and without it.
--
-- What
--   1. public.student_reads_grading_scheme(p_scheme uuid) returns boolean:
--      true when the calling Student has at least one mark in an exam that
--      uses this grading scheme AND whose results are published.
--   2. Two SELECT-only policies, one on grading_schemes and one on
--      grade_bands, that let a Student read exactly those schemes and bands.
--
-- Why
--   A Student login reads zero rows from grading_schemes and grade_bands: their
--   only policies ask for app_current_school_id() and the Exams Permission
--   Grant (0037, 0136), both empty for a Student. The portal needs the scheme
--   to grade a published result, so today the result page shows marks without
--   grade, GPA or pass/fail (lib/student/result-fallback.ts) and the printed
--   mark sheet returns 404.
--
-- Scope of the new read — the same exams student_exam_result (0143) already
--   shows: published, and the Student has a mark in it. A scheme no published
--   exam of theirs uses stays unreadable. Nothing is writable. Staff policies
--   are not touched.
--
-- Why a function and not a subquery in the policy
--   A subquery in a policy runs with the caller's own row level security, and
--   a Student cannot read exams or exam_marks, so it would match nothing.
--
-- Grants: the function keeps its default EXECUTE grant on purpose. It is a
--   policy helper, and 0150 leaves those ungranted-to-nobody for a stated
--   reason: a policy expression runs with the requesting role's privileges, so
--   revoking PUBLIC would turn an anonymous read of grading_schemes from "no
--   rows" into "permission denied for function". It returns false for anyone
--   who is not a Student with such a mark (auth.uid() matches no student row).
--
-- Effect on existing data: none. No row, column or existing policy changes.
--
-- PRE-CHECK (read-only) — how many schemes become readable, and by how many
--   students. Zero rows means no exam is published yet and nothing changes.
--     select gs.school_id, gs.id as scheme_id, gs.name,
--            count(distinct m.student_id) as students_who_can_read_it
--       from grading_schemes gs
--       join exams e on e.grading_scheme_id = gs.id and e.results_published_at is not null
--       join exam_marks m on m.exam_id = e.id
--      group by gs.school_id, gs.id, gs.name
--      order by gs.school_id, gs.name;
--   And confirm no policy of these names exists already:
--     select tablename, policyname from pg_policies
--      where schemaname = 'public' and tablename in ('grading_schemes', 'grade_bands');
--
-- Rollback (policies first: they call the function)
--   drop policy if exists "student reads grading scheme of own published result" on public.grading_schemes;
--   drop policy if exists "student reads grade bands of own published result" on public.grade_bands;
--   drop function if exists public.student_reads_grading_scheme(uuid);
--   notify pgrst, 'reload schema';
--   (The portal goes back to raw marks without grades, as today.)
-- Idempotent.

create or replace function public.student_reads_grading_scheme(p_scheme uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from exams e
      join exam_marks m on m.exam_id = e.id
      join students me on me.id = m.student_id
                      and me.profile_id = auth.uid()
                      and me.archived_at is null
     where e.grading_scheme_id = p_scheme
       and e.results_published_at is not null
  )
$$;

-- The school_id line is the cheap first filter and keeps the words
-- app_current_student in the policy text: 0136's rewrite loop skips policies
-- that carry them, so a replay of 0136 cannot wrap this one in a staff grant.
drop policy if exists "student reads grading scheme of own published result" on public.grading_schemes;
create policy "student reads grading scheme of own published result" on public.grading_schemes
  for select using (
    school_id = (select public.app_current_student_school_id())
    and public.student_reads_grading_scheme(id)
  );

drop policy if exists "student reads grade bands of own published result" on public.grade_bands;
create policy "student reads grade bands of own published result" on public.grade_bands
  for select using (
    school_id = (select public.app_current_student_school_id())
    and public.student_reads_grading_scheme(grading_scheme_id)
  );

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0223_exam_marks_absent_and_atomic_save.sql
-- ===========================================================================
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

-- ===========================================================================
-- FILE 0224_exam_routine_no_class_overlap.sql
-- ===========================================================================
-- 0224_exam_routine_no_class_overlap.sql — issue #699 (migration index #703, row 3.3).
-- WRITTEN, NOT APPLIED. The app works with and without it.
--
-- What
--   A trigger on exam_routine_entries that refuses a sitting whose time
--   overlaps another sitting of the SAME CLASS on the same day — in the same
--   exam or in any other exam of that class. It takes a per-class transaction
--   lock first, so two saves at the same moment cannot both pass.
--
-- Why
--   The overlap check lived in the server action only, and compared sittings
--   inside one exam. Two exams of one class could be scheduled on top of each
--   other, and two simultaneous saves could both pass the check.
--
-- Why a trigger and not the exclusion constraint the issue names
--   The rule is per CLASS, and the class is on `exams`, not on
--   exam_routine_entries. An exclusion constraint would need (1) the btree_gist
--   extension, (2) a copy of class_id on every routine row kept in step with
--   exams.class_id by two more triggers, and (3) it cannot be added NOT VALID,
--   so the migration would FAIL while any old overlap exists. The trigger
--   gives the same guarantee for every new or changed sitting, needs none of
--   that, and leaves existing rows alone. If the owner wants the constraint
--   itself, this trigger is the first half of that work.
--
-- The rule (the same as overlappingRoutineEntry in web/lib/exam-setup.ts)
--   - same class (exams.class_id), same exam_date, start < other end and
--     end > other start. Back-to-back sittings (one ends as the next starts)
--     do not clash.
--   - the sitting of the same exam AND subject is the row being replaced
--     (unique (exam_id, subject_id); the app saves with an upsert), not a clash.
--   - an exam with no class yet is not checked: there is no class to clash in.
--   - closed exams of the class count too: the students sat that paper.
--   Refusal: SQLSTATE 23P01 (exclusion_violation), message
--   'exam routine overlaps another sitting of this class'. The app turns that
--   code into its existing overlap message.
--
-- Known limits (not covered here)
--   - Setting or changing exams.class_id AFTER the routine is entered is not
--     re-checked.
--   - Existing overlaps stay until someone edits them (see the pre-check).
--
-- Effect on existing data: none. No row is read-modified or deleted. A row
--   that already overlaps is only refused when it is next saved with a time
--   that still overlaps.
--
-- PRE-CHECK (read-only) — overlaps that exist today. Zero rows expected. Any
--   row here is a real double booking the school should fix on the routine
--   screen; the migration can be applied either way.
--     select s.name as school, c.name as class, c.section, a.exam_date,
--            ea.name as exam_a, sa.name as subject_a, a.start_time, a.end_time,
--            eb.name as exam_b, sb.name as subject_b, b.start_time as b_start, b.end_time as b_end
--       from exam_routine_entries a
--       join exams ea on ea.id = a.exam_id
--       join exam_routine_entries b on b.exam_date = a.exam_date and b.id > a.id
--                                  and b.start_time < a.end_time and b.end_time > a.start_time
--       join exams eb on eb.id = b.exam_id and eb.class_id = ea.class_id
--       join class_offerings c on c.id = ea.class_id
--       join schools s on s.id = ea.school_id
--       join subjects sa on sa.id = a.subject_id
--       join subjects sb on sb.id = b.subject_id
--      order by s.name, a.exam_date, a.start_time;
--
-- Rollback
--   drop trigger if exists exam_routine_entry_time_free on public.exam_routine_entries;
--   drop function if exists public.enforce_exam_routine_no_class_overlap();
--   notify pgrst, 'reload schema';
--   (The app's own check stays, so only the simultaneous-save case reopens.)
-- Idempotent.

create or replace function public.enforce_exam_routine_no_class_overlap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_class uuid;
begin
  select class_id into v_class from exams where id = new.exam_id;
  if v_class is null then
    return new;
  end if;

  -- One writer per class at a time, until this transaction ends: the second of
  -- two simultaneous saves waits here and then sees the first one's row.
  perform pg_advisory_xact_lock(hashtextextended('exam_routine_class:' || v_class::text, 0));

  if exists (
    select 1
      from exam_routine_entries r
      join exams e on e.id = r.exam_id
     where e.class_id = v_class
       and r.exam_date = new.exam_date
       and r.start_time < new.end_time
       and r.end_time > new.start_time
       and not (r.exam_id = new.exam_id and r.subject_id = new.subject_id)
  ) then
    raise exception 'exam routine overlaps another sitting of this class' using errcode = '23P01';
  end if;
  return new;
end $$;

-- A trigger function needs no EXECUTE grant (0150, section 1): close it as an RPC.
revoke execute on function public.enforce_exam_routine_no_class_overlap() from public;
revoke execute on function public.enforce_exam_routine_no_class_overlap() from anon;

-- The name is chosen to sort AFTER exam_routine_entry_same_school: triggers of
-- one kind fire in name order, and the closed-exam / same-school refusal must
-- keep coming first (tests/integration/exam-setup.test.ts expects it).
drop trigger if exists exam_routine_entry_time_free on public.exam_routine_entries;
create trigger exam_routine_entry_time_free
  before insert or update of exam_id, subject_id, exam_date, start_time, end_time
  on public.exam_routine_entries
  for each row execute function public.enforce_exam_routine_no_class_overlap();

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0231_fee_record_void.sql
-- ===========================================================================
-- 0231_fee_record_void.sql
-- #683: void a Fee Collection Record instead of editing it away.
--
-- What:
--   1. fee_collection_records.void_at / void_by / void_reason (who, when, why).
--   2. fee_record_void_guard (before insert or update): only the School Owner
--      may void; a reason is required; the void stamps void_at = now() and
--      void_by = auth.uid() itself (the request cannot choose them); a void may
--      change nothing else on the row; a voided row can never be changed or
--      un-voided; a row cannot be created already voided.
--   3. fee_gl_void (after update of void_at): posts the reversing entry to the
--      general ledger in the same transaction, through the same fee_gl_apply
--      (0097) and the same `fee:<record id>:<seq>` ref as every other posting
--      of the record, so the receipt's "ledger impact" lists it.
--   4. fee_post_gl_delete (0097) skips a voided row: its money is already
--      reversed, and deleting it (a Student delete cascades) must not reverse
--      it a second time.
--   5. "One record per Student per month" becomes "one record that is not
--      voided": the unique CONSTRAINT one_record_per_student_month is replaced
--      by the partial unique INDEX one_active_fee_record_per_student_month.
--      Without this a voided month could never be collected again, and "void
--      and re-record" (ADR 0012) would be impossible.
--   6. student_fee_record (0147) leaves voided rows out, so a Student never
--      sees a payment that was reversed. Same columns as before; fee_amount and
--      adjust_amount stay absent (ADR 0015).
-- Why: a wrong collection (wrong Student, wrong month) could only be edited.
--   An edit leaves no record of the mistake or of who undid it.
-- Effect on existing data: NONE. Three nullable columns, no default; no row is
--   updated, deleted or re-dated; every stored amount stays as it is. A void
--   itself changes no amount either: the row keeps pay / fine / adjust / due
--   and its updated_at, and gains only the three void fields.
-- New constraint on existing rows: fee_record_void_has_reason is satisfied by
--   every existing row (all three new columns are NULL). The partial unique
--   index cannot fail: the rows it covers are exactly the rows the old
--   constraint already holds unique.
-- App before / after: lib/fee-columns.ts probes for void_at. Absent: no void
--   control is shown and the void action answers "not available yet". Present:
--   the School Owner can void from the receipt; voided rows are listed as
--   voided and left out of every total.
--
-- !! ON CONFLICT: after this migration `insert ... on conflict (student_id,
--   month, year)` has no constraint to match and fails (42P10). The two callers
--   in this repository were changed in the same commit so they work before and
--   after: supabase/staging-seed.sql and tests/integration/staff-screen-grants.test.ts.
--   Check other branches (grep "student_id, month, year" / "student_id,month,year")
--   before applying.
--
-- PRE-CHECK (read-only; run before applying):
--   -- a. the old constraint is there and holds (expect 1 row, then 0 rows)
--   select conname from pg_constraint
--    where conrelid = 'public.fee_collection_records'::regclass
--      and conname = 'one_record_per_student_month';
--   select student_id, month, year, count(*) from public.fee_collection_records
--    group by 1, 2, 3 having count(*) > 1;
--   -- b. the two objects this file replaces are still as 0097 / 0147 wrote
--   --    them (compare with the rollback text below)
--   select pg_get_functiondef('public.fee_post_gl_delete()'::regprocedure);
--   select pg_get_viewdef('public.student_fee_record'::regclass, true);
--   -- c. trigger names: fee_record_void_guard must sort AFTER fee_record_touch
--   --    (before-triggers fire in name order; the guard restores updated_at)
--   select tgname from pg_trigger
--    where tgrelid = 'public.fee_collection_records'::regclass and not tgisinternal
--    order by tgname;
--   -- d. none of the new names is taken (expect 0 rows)
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'fee_collection_records'
--      and column_name in ('void_at', 'void_by', 'void_reason');
--
-- POST-CHECK (read-only):
--   select count(*) as voided from public.fee_collection_records where void_at is not null;  -- expect 0
--   select indexdef from pg_indexes where indexname = 'one_active_fee_record_per_student_month';
--
-- Rollback. ONLY while both of these return nothing — otherwise stop: a voided
--   row would come back to life with its ledger entry already reversed, or the
--   old constraint could not be restored without deleting a financial row.
--     select id from public.fee_collection_records where void_at is not null limit 1;
--     select student_id, month, year from public.fee_collection_records
--      group by 1, 2, 3 having count(*) > 1 limit 1;
--   Then, in this order (the function and the view name void_at, so they go
--   back first; the constraint is restored before its replacement is dropped):
--     drop trigger if exists fee_gl_void on public.fee_collection_records;
--     drop trigger if exists fee_record_void_guard on public.fee_collection_records;
--     create or replace function public.fee_post_gl_delete() returns trigger
--       language plpgsql security definer set search_path = public as $$
--     declare cash_acct text;
--     begin
--       cash_acct := case when old.payment_method = 'cash' then '1000' else '1050' end;
--       perform public.fee_gl_apply(old.id, old.school_id,
--         'Fee reversal ' || old.month || '/' || old.year,
--         -round(old.pay_amount * 100)::bigint, -round(old.fine_amount * 100)::bigint, cash_acct);
--       return old;
--     end;
--     $$;
--     create or replace view public.student_fee_record with (security_invoker = off, security_barrier = true) as
--       select f.id, f.month, f.year, f.pay_amount, f.fine_amount, f.due_amount, f.payment_method, f.updated_at
--         from public.fee_collection_records f
--         join public.students me
--           on me.id = f.student_id and me.profile_id = auth.uid() and me.archived_at is null;
--     alter table public.fee_collection_records
--       add constraint one_record_per_student_month unique (student_id, month, year);
--     drop index if exists public.one_active_fee_record_per_student_month;
--     alter table public.fee_collection_records drop constraint if exists fee_record_void_has_reason;
--     drop function if exists public.fee_post_gl_void();
--     drop function if exists public.fee_record_void_guard();
--     alter table public.fee_collection_records
--       drop column if exists void_reason, drop column if exists void_by, drop column if exists void_at;
--     notify pgrst, 'reload schema';
-- Idempotent.

-- 1. Who, when, why -----------------------------------------------------------

alter table public.fee_collection_records
  add column if not exists void_at timestamptz,
  add column if not exists void_by uuid,
  add column if not exists void_reason text;

comment on column public.fee_collection_records.void_at is
  'When the record was voided (#683). NULL = active. Set only by fee_record_void_guard; a voided row is immutable.';

-- void_by is the auth user id of whoever voided, and deliberately NOT a foreign
-- key to profiles. With `on delete set null` Postgres would UPDATE the voided
-- row when that profile is deleted, the guard below refuses any change to a
-- voided row, and the profile could never be deleted. An audit stamp should
-- outlive the profile anyway. It is not part of the check for the same reason
-- a service-role void is refused: only the trigger sets it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fee_collection_records'::regclass
       and conname = 'fee_record_void_has_reason'
  ) then
    alter table public.fee_collection_records
      add constraint fee_record_void_has_reason check (
        (void_at is null and void_reason is null and void_by is null)
        or (void_at is not null and char_length(btrim(void_reason)) between 1 and 500)
      );
  end if;
end $$;

-- 2. One ACTIVE record per Student per month ----------------------------------
-- The index goes in before the constraint goes out, so uniqueness is never
-- unenforced, not even inside this transaction.

create unique index if not exists one_active_fee_record_per_student_month
  on public.fee_collection_records (student_id, month, year)
  where void_at is null;

alter table public.fee_collection_records
  drop constraint if exists one_record_per_student_month;

-- 3. The void rules -----------------------------------------------------------
-- Security invoker: it only reads auth.uid() and app_current_role(), and both
-- answer for the caller. Fires after fee_record_touch (name order), which has
-- already set updated_at = now(); a void puts the old value back, because the
-- ledger page and the receipt date the payment by updated_at and the void has
-- its own date.

create or replace function public.fee_record_void_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  untouched constant text[] := array['void_at', 'void_by', 'void_reason', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    if new.void_at is not null or new.void_by is not null or new.void_reason is not null then
      raise exception 'a fee record cannot be created voided';
    end if;
    return new;
  end if;

  if old.void_at is not null then
    raise exception 'a voided fee record cannot be changed';
  end if;

  if new.void_at is null then
    -- Not a void: the void fields stay empty.
    if new.void_by is not null or new.void_reason is not null then
      raise exception 'void_by and void_reason are set only by voiding the record';
    end if;
    return new;
  end if;

  if coalesce(public.app_current_role()::text, '') <> 'school_owner' then
    raise exception 'only the School Owner can void a fee record';
  end if;
  new.void_reason := btrim(new.void_reason);
  if new.void_reason is null or new.void_reason = '' then
    raise exception 'a void needs a reason';
  end if;
  if (to_jsonb(new) - untouched) is distinct from (to_jsonb(old) - untouched) then
    raise exception 'a void cannot change any other field of the fee record';
  end if;

  new.void_at := now();
  new.void_by := auth.uid();
  new.updated_at := old.updated_at;
  return new;
end $$;

drop trigger if exists fee_record_void_guard on public.fee_collection_records;
create trigger fee_record_void_guard
  before insert or update on public.fee_collection_records
  for each row execute function public.fee_record_void_guard();

-- 4. The reversing ledger entry ----------------------------------------------
-- Mirrors fee_post_gl_delete (0097): the record's whole pay and fine, negated,
-- against the cash account its payment method maps to. fee_gl_apply skips a
-- record with no money on it.

create or replace function public.fee_post_gl_void() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.fee_gl_apply(new.id, new.school_id,
    'Fee void ' || new.month || '/' || new.year,
    -round(new.pay_amount * 100)::bigint, -round(new.fine_amount * 100)::bigint,
    case when new.payment_method = 'cash' then '1000' else '1050' end);
  return new;
end;
$$;

drop trigger if exists fee_gl_void on public.fee_collection_records;
create trigger fee_gl_void
  after update of void_at on public.fee_collection_records
  for each row when (old.void_at is null and new.void_at is not null)
  execute function public.fee_post_gl_void();

-- Deleting a voided row must not reverse it again. Body as in 0097 plus the
-- one guard.
create or replace function public.fee_post_gl_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
declare cash_acct text;
begin
  if old.void_at is not null then return old; end if;
  cash_acct := case when old.payment_method = 'cash' then '1000' else '1050' end;
  perform public.fee_gl_apply(old.id, old.school_id,
    'Fee reversal ' || old.month || '/' || old.year,
    -round(old.pay_amount * 100)::bigint, -round(old.fine_amount * 100)::bigint, cash_acct);
  return old;
end;
$$;

-- Trigger functions need no EXECUTE for anyone (0150): the trigger mechanism
-- does not check it. Only the two NEW functions are closed here;
-- fee_post_gl_delete keeps whatever grants it had (`create or replace` does
-- not touch them).
revoke execute on function public.fee_record_void_guard() from public, anon, authenticated;
revoke execute on function public.fee_post_gl_void() from public, anon, authenticated;

-- 5. A Student never sees a voided record -------------------------------------
-- Same column list as 0147, so `create or replace` keeps the view's grants.

create or replace view public.student_fee_record with (security_invoker = off, security_barrier = true) as
  select f.id,
         f.month,
         f.year,
         f.pay_amount,
         f.fine_amount,
         f.due_amount,
         f.payment_method,
         f.updated_at
    from public.fee_collection_records f
    join public.students me
      on me.id = f.student_id
     and me.profile_id = auth.uid()
     and me.archived_at is null
   where f.void_at is null;

grant select on public.student_fee_record to authenticated;

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0232_director_capital_guard.sql
-- ===========================================================================
-- 0232_director_capital_guard.sql
-- #681: stop the director capital balance drifting away from its transactions.
--
-- Cause (found on merge/staging-sync): director_capital_balances.balance is a
--   running total kept by apply_director_capital_transaction (0055), a BEFORE
--   INSERT trigger. Nothing ran on DELETE or UPDATE, so deleting a transaction
--   left its amount in the balance — and its entry in the general ledger
--   (director_capital_post_gl, 0098, is insert-only too). An integration test
--   deleted its own rows as the School Owner on the shared database on every
--   run; Test School A's stored balance is ৳13,14,000 above what its
--   transactions add up to.
-- What: one trigger, director_capital_transaction_guard (before update or
--   delete), running director_capital_guard():
--   * UPDATE: amount, txn_type, school_id and balance_after cannot change, for
--     any caller. txn_date and note can.
--   * DELETE by a signed-in School member (owner or staff): refused. A wrong
--     transaction is corrected by recording the opposite one.
--   * DELETE by anyone else — the SQL editor, the service role, a Super Admin,
--     i.e. deliberate operations work — is allowed and REVERSES the row: the
--     balance moves back by the row's amount and a contra entry
--     `dircap:<id>:reversal` is posted to the general ledger. The balance can
--     no longer drift whoever deletes. No floor is applied: deleting an
--     investment that was later withdrawn leaves a negative balance, which is
--     what the remaining rows add up to.
--   * DELETE because the School itself is being deleted (cascade): nothing to
--     keep straight, the row just goes.
-- Effect on existing data: NONE. No balance, no transaction and no ledger entry
--   is changed by applying this file. In particular it does NOT correct Test
--   School A's existing ৳13,14,000 difference: that needs the owner's decision
--   (recompute the balance, or record it as an opening entry) and is not
--   written anywhere in this branch. The read-only query below shows it.
-- Note for the test-data cleanup (#686): once this is applied, deleting test
--   capital rows from the SQL editor lowers the stored balance by their amount
--   and posts contra entries. That is the intended, correct effect.
-- App before / after: the app never updates or deletes these rows (it only
--   inserts), so nothing changes for it either way.
--
-- PRE-CHECK (read-only; run before applying, keep the output):
--   -- a. stored balance against the transactions, per School. A row here is a
--   --    School whose balance its transactions do not explain.
--   select b.school_id, s.name,
--          b.balance                          as stored_balance,
--          coalesce(t.net, 0)                 as net_of_transactions,
--          b.balance - coalesce(t.net, 0)     as unexplained,
--          coalesce(t.txns, 0)                as transactions
--     from public.director_capital_balances b
--     join public.schools s on s.id = b.school_id
--     left join (
--       select school_id,
--              sum(case when txn_type = 'invest' then amount else -amount end) as net,
--              count(*) as txns
--         from public.director_capital_transactions group by school_id
--     ) t on t.school_id = b.school_id
--    where b.balance <> coalesce(t.net, 0);
--   -- b. the same account in the general ledger (taka), for comparison
--   select e.school_id, sum(l.credit - l.debit) / 100.0 as gl_director_capital
--     from public.gl_lines l join public.gl_entries e on e.id = l.entry_id
--    where l.account_code = '3000' group by e.school_id;
--   -- c. the trigger name is free (expect 0 rows)
--   select tgname from pg_trigger
--    where tgrelid = 'public.director_capital_transactions'::regclass
--      and tgname = 'director_capital_transaction_guard';
--
-- POST-CHECK (read-only): query (a) must return exactly what it returned before.
--
-- Rollback:
--   drop trigger if exists director_capital_transaction_guard on public.director_capital_transactions;
--   drop function if exists public.director_capital_guard();
--   notify pgrst, 'reload schema';
-- Idempotent.

-- Definer: a School member has no write policy on director_capital_balances
-- (0055 gives select only), and the ledger is written through gl_post_system.
create or replace function public.director_capital_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  signed numeric(12, 2);
  poisha bigint;
begin
  if tg_op = 'UPDATE' then
    if new.amount is distinct from old.amount
       or new.txn_type is distinct from old.txn_type
       or new.school_id is distinct from old.school_id
       or new.balance_after is distinct from old.balance_after then
      raise exception 'a director capital transaction cannot be changed; record a reversing transaction instead';
    end if;
    return new;
  end if;

  -- The School is being deleted and this row goes with it: the cascade runs
  -- after the School row is gone, so there is no balance or ledger to adjust.
  if not exists (select 1 from schools where id = old.school_id) then
    return old;
  end if;

  if auth.uid() is not null and coalesce(app_current_role()::text, '') <> 'super_admin' then
    raise exception 'a director capital transaction cannot be deleted; record a reversing transaction instead';
  end if;

  -- An operations delete: take the row's effect back out of the balance and
  -- post the contra of director_capital_post_gl (0098).
  signed := case when old.txn_type = 'invest' then old.amount else -old.amount end;
  update director_capital_balances set balance = balance - signed where school_id = old.school_id;
  poisha := round(signed * 100)::bigint;
  perform gl_post_system('dircap:' || old.id || ':reversal', 'Director capital reversal ' || old.txn_type,
    jsonb_build_array(gl_line('1000', poisha), gl_line('3000', -poisha)), old.school_id);
  return old;
end $$;

-- A trigger function needs no EXECUTE for anyone (0150).
revoke execute on function public.director_capital_guard() from public, anon, authenticated;

drop trigger if exists director_capital_transaction_guard on public.director_capital_transactions;
create trigger director_capital_transaction_guard
  before update or delete on public.director_capital_transactions
  for each row execute function public.director_capital_guard();

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0240_employee_attendance_admin_rls.sql
-- ===========================================================================
-- 0240_employee_attendance_admin_rls.sql
-- Issue #677 (Attendance permission includes employee admin). Index item 1.6.
-- WRITTEN, NOT APPLIED. Staging and production share one database.
--
-- WHAT
--   Seven tables that configure EMPLOYEE attendance keep their read access
--   exactly as it is today and get a narrower WRITE rule:
--     attendance_machines, machine_enroll_infos            (0213, 0211)
--     category_office_hours                                (0205)
--     standing_grace_rules, standing_grace_rule_categories (0210)
--     ad_hoc_grace_exemptions, ad_hoc_grace_exemption_categories (0208)
--   A write now needs all three:
--     1. the row is in the caller's School (unchanged),
--     2. the caller holds the Attendance grant (app_module_granted, 0136),
--     3. the caller is the School Owner, or a Staff User with NO employees row
--        (office staff - ADR 0021's signal, the same test 0163 uses on
--        `classes`).
--
-- WHY
--   The Attendance grant gates the whole /school/attendance segment (ADR 0020,
--   ADR 0029). A Class Teacher who holds it for her own register could add,
--   edit and delete attendance machines, Grace Time rules and Office Hours for
--   the whole School (audit finding AT1). Two things made it worse than the
--   issue says:
--     - category_office_hours, standing_grace_rules(+categories) and
--       ad_hoc_grace_exemptions(+categories) were created AFTER 0136 with a
--       plain "school_id = app_current_school_id()" policy, so today ANY Staff
--       User of the School - with no grant at all - can write them through the
--       API. Condition 2 closes that.
--     - the app refused nothing; it now does (lib/school/employee-attendance-
--       admin.ts), and this migration is the same rule in the database.
--
-- DECISION TAKEN (open in the issue; the owner can reverse it)
--   Not option A (owner only) and not option B (a new permission key). Office
--   staff keep everything they have; only teachers are narrowed. No School has
--   to re-grant anybody. To reverse: run the rollback below and make
--   `mayAdministerEmployeeAttendance` return true.
--
-- EFFECT ON EXISTING DATA
--   None. No row is read, changed or deleted. Policies only.
--
-- EFFECT PER ROLE
--   School Owner ............ no change (read and write everything).
--   Office staff + Attendance  no change (read and write everything).
--   Office staff, no grant .... machines/enrollments: no change (already
--                               refused). Office Hour / grace tables: can
--                               still READ, can no longer WRITE through the
--                               API. They never could in the app: the proxy
--                               refuses /school/attendance without the grant.
--   Class teacher / subject teacher (a Staff User with an employees row)
--                               READ unchanged; WRITE refused on all seven
--                               tables, with or without the grant.
--   Student ................... no change (app_current_school_id() is null for
--                               a Student since 0131; no access before or after).
--   anon ...................... no change (no access).
--   Super Admin ............... no change ("super admin manages ..." untouched).
--
-- WHO RELIES ON THE OLD ACCESS, AND WHY THEY STILL WORK
--   Readers (unchanged - the read policies below repeat today's predicate):
--     app/school/attendance/employee/page.tsx            standing_grace_rules, ad_hoc_grace_exemptions
--     app/school/attendance/employee/grace-time/page.tsx same two + lib/school/ad-hoc-grace.ts
--     app/school/attendance/employee/office-hour/page.tsx category_office_hours
--     app/school/attendance/machine/**/page.tsx          via lib/machine-enrollment-store.ts
--   Writers (all behind the app guard added with this issue, so the only
--   callers left are the Owner and office staff, who pass condition 3):
--     app/school/attendance/employee/grace-time/actions.ts  (incl. rpc save_standing_grace_rule,
--                                                            SECURITY INVOKER - it runs under these policies)
--     app/school/attendance/employee/office-hour/actions.ts
--     app/school/attendance/machine/actions.ts -> lib/machine-enrollment-store.ts
--   SQL that reads these tables and is SECURITY DEFINER, so RLS does not apply:
--     effective_grace_for_my_school(), effective_grace_minutes(uuid) (0210),
--     reconcile_attendance (0211), assign_*_unique_id triggers (0211).
--   Nothing writes these tables from a trigger or from /api (checked with grep
--   over web/app, web/lib and web/supabase/migrations).
--
-- PRE-CHECK (read-only; run before applying, keep the output)
--   -- 1. The policies this file replaces. Expect exactly the seven
--   --    "school members manage ..." rows plus seven "super admin manages ...".
--   --    Any OTHER policy on these tables was not written by a migration:
--   --    stop and review it first.
--   select tablename, policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('attendance_machines','machine_enroll_infos','category_office_hours',
--                        'standing_grace_rules','standing_grace_rule_categories',
--                        'ad_hoc_grace_exemptions','ad_hoc_grace_exemption_categories')
--    order by tablename, policyname;
--
--   -- 2. Who loses write access: Staff Users with an (unarchived) employees
--   --    row who hold the Attendance grant. Expect a short list of teachers.
--   select p.school_id, p.id as staff_user_id, p.full_name, e.id as employee_id
--     from public.profiles p
--     join public.staff_permissions sp on sp.staff_user_id = p.id and sp.screen_key = 'attendance'
--     join public.employees e on e.profile_id = p.id and e.archived_at is null
--    where p.role = 'staff_user'
--    order by p.school_id, p.full_name;
--
--   -- 3. The helper functions exist (all three must return a row).
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('app_module_granted','app_current_employee_id','app_current_role');
--
-- ROLLBACK (exact, in this order; restores 0205/0208/0210/0211/0213 as written)
--   drop policy if exists "employee attendance admins write attendance_machines" on public.attendance_machines;
--   drop policy if exists "school members read attendance_machines" on public.attendance_machines;
--   create policy "school members manage attendance machines" on public.attendance_machines
--     for all
--     using (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')))
--     with check (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')));
--
--   drop policy if exists "employee attendance admins write machine_enroll_infos" on public.machine_enroll_infos;
--   drop policy if exists "school members read machine_enroll_infos" on public.machine_enroll_infos;
--   create policy "school members manage machine enrollments" on public.machine_enroll_infos
--     for all
--     using (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')))
--     with check (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')));
--
--   drop policy if exists "employee attendance admins write category_office_hours" on public.category_office_hours;
--   drop policy if exists "school members read category_office_hours" on public.category_office_hours;
--   create policy "school members manage category_office_hours" on public.category_office_hours
--     for all using (school_id = public.app_current_school_id());
--
--   drop policy if exists "employee attendance admins write standing_grace_rules" on public.standing_grace_rules;
--   drop policy if exists "school members read standing_grace_rules" on public.standing_grace_rules;
--   create policy "school members manage standing_grace_rules" on public.standing_grace_rules
--     for all using (school_id = public.app_current_school_id());
--
--   drop policy if exists "employee attendance admins write standing_grace_rule_categories" on public.standing_grace_rule_categories;
--   drop policy if exists "school members read standing_grace_rule_categories" on public.standing_grace_rule_categories;
--   create policy "school members manage standing_grace_rule_categories" on public.standing_grace_rule_categories
--     for all using (exists (select 1 from public.standing_grace_rules r
--                             where r.id = rule_id and r.school_id = public.app_current_school_id()));
--
--   drop policy if exists "employee attendance admins write ad_hoc_grace_exemptions" on public.ad_hoc_grace_exemptions;
--   drop policy if exists "school members read ad_hoc_grace_exemptions" on public.ad_hoc_grace_exemptions;
--   create policy "school members manage ad_hoc_grace_exemptions" on public.ad_hoc_grace_exemptions
--     for all using (school_id = public.app_current_school_id());
--
--   drop policy if exists "employee attendance admins write ad_hoc_grace_exemption_categories" on public.ad_hoc_grace_exemption_categories;
--   drop policy if exists "school members read ad_hoc_grace_exemption_categories" on public.ad_hoc_grace_exemption_categories;
--   create policy "school members manage ad_hoc_grace_exemption_categories" on public.ad_hoc_grace_exemption_categories
--     for all using (exists (select 1 from public.ad_hoc_grace_exemptions e
--                             where e.id = exemption_id and e.school_id = public.app_current_school_id()));
--
--   notify pgrst, 'reload schema';

-- One loop, three shapes of "this row is in my School":
--   own      - the table carries school_id (and already asks for the grant on read: machines)
--   plain    - the table carries school_id, read has no grant term today
--   via rule / via exemption - a join table scoped through its parent row
--
-- For each table: drop the old FOR ALL policy, then
--   "school members read <t>"                  FOR SELECT, TODAY'S predicate, unchanged
--   "employee attendance admins write <t>"     FOR ALL,    scope + grant + (owner or no employees row)
-- Policies are permissive and OR together, so SELECT = old predicate OR the
-- narrower one = the old predicate; INSERT/UPDATE/DELETE see only the second.
do $$
declare
  m record;
  admin constant text :=
    '(select public.app_module_granted(''attendance''))'
    || ' and ((select public.app_current_role()) = ''school_owner'''
    || ' or (select public.app_current_employee_id()) is null)';
begin
  for m in
    select * from (values
      ('attendance_machines',
       'school members manage attendance machines',
       'school_id = public.app_current_school_id() and (select public.app_module_granted(''attendance''))',
       'school_id = public.app_current_school_id()'),
      ('machine_enroll_infos',
       'school members manage machine enrollments',
       'school_id = public.app_current_school_id() and (select public.app_module_granted(''attendance''))',
       'school_id = public.app_current_school_id()'),
      ('category_office_hours',
       'school members manage category_office_hours',
       'school_id = public.app_current_school_id()',
       'school_id = public.app_current_school_id()'),
      ('standing_grace_rules',
       'school members manage standing_grace_rules',
       'school_id = public.app_current_school_id()',
       'school_id = public.app_current_school_id()'),
      ('standing_grace_rule_categories',
       'school members manage standing_grace_rule_categories',
       'exists (select 1 from public.standing_grace_rules r where r.id = rule_id and r.school_id = public.app_current_school_id())',
       'exists (select 1 from public.standing_grace_rules r where r.id = rule_id and r.school_id = public.app_current_school_id())'),
      ('ad_hoc_grace_exemptions',
       'school members manage ad_hoc_grace_exemptions',
       'school_id = public.app_current_school_id()',
       'school_id = public.app_current_school_id()'),
      ('ad_hoc_grace_exemption_categories',
       'school members manage ad_hoc_grace_exemption_categories',
       'exists (select 1 from public.ad_hoc_grace_exemptions e where e.id = exemption_id and e.school_id = public.app_current_school_id())',
       'exists (select 1 from public.ad_hoc_grace_exemptions e where e.id = exemption_id and e.school_id = public.app_current_school_id())')
    ) as t(tbl, old_policy, read_pred, scope_pred)
  loop
    execute format('drop policy if exists %I on public.%I', m.old_policy, m.tbl);
    execute format('drop policy if exists %I on public.%I', 'school members read ' || m.tbl, m.tbl);
    execute format('drop policy if exists %I on public.%I', 'employee attendance admins write ' || m.tbl, m.tbl);

    execute format('create policy %I on public.%I for select using (%s)',
      'school members read ' || m.tbl, m.tbl, m.read_pred);

    execute format('create policy %I on public.%I for all using ((%s) and %s) with check ((%s) and %s)',
      'employee attendance admins write ' || m.tbl, m.tbl, m.scope_pred, admin, m.scope_pred, admin);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0241_staff_login_disable.sql
-- ===========================================================================
-- 0241_staff_login_disable.sql
-- Issue #688 (Archiving an employee leaves their staff login active). Index item 1.3.
-- WRITTEN, NOT APPLIED. The app works with and without it: until it is applied
-- the "disable login" action answers "not available yet" and archiving behaves
-- exactly as today (lib/staff-login.ts).
--
-- WHAT
--   1. profiles.login_disabled_at timestamptz, nullable. Null = login works
--      (every existing row). A CHECK allows a value on a staff_user row only.
--   2. set_staff_login_disabled(p_staff uuid, p_disabled boolean): the School
--      Owner turns ONE Staff User login of their own School off or on.
--        off: blocks sign-in (auth.users.banned_until, 100 years ahead), ends
--             every open session (auth.sessions, auth.refresh_tokens,
--             auth.one_time_tokens for that user - the same three deletes
--             set_student_password does, 0132), stamps login_disabled_at.
--        on:  clears banned_until and login_disabled_at.
--      Both are written to the audit log.
--
-- WHY
--   Archiving an Employee only sets employees.archived_at. The linked login
--   keeps working, and nothing in the app could turn a login off at all.
--   It is worse than the issue says: app_current_employee_id() (0138) ignores
--   an ARCHIVED employees row, so an archived teacher's login is read as
--   "no employees row" = office staff, and ADR 0021 then gives it the WHOLE
--   School's students instead of her own classes. Archiving widens access.
--   Turning the login off is what closes that.
--
-- DECISIONS TAKEN (both open in the issue; the owner can reverse them)
--   - Nothing is deleted. The auth user, the profile, the employees link and
--     every staff_permissions row stay, so turning the login back on restores
--     exactly the access it had. The issue's "remove all staff_permissions"
--     is NOT done: it is not reversible, and it would not stop the login from
--     reading students (that table is not grant-gated).
--   - Archiving does not disable the login by itself in the database. The app
--     offers it in the archive confirmation, ticked by default, for the School
--     Owner. Un-archiving does NOT turn the login back on; the app says so and
--     links to the Staff page.
--
-- EFFECT ON EXISTING DATA
--   A new nullable column, null on every row. No row is changed or deleted by
--   this file. The CHECK passes on every existing row (all null).
--
-- EFFECT PER ROLE
--   School Owner ............ gains one function. Can never be disabled: the
--                             function accepts only role = 'staff_user' targets
--                             in the Owner's own School, and the CHECK refuses
--                             the column on any other role.
--   Office staff / class teacher / subject teacher
--                             no change until an Owner disables that one login.
--                             A disabled login cannot sign in or refresh, and
--                             its open sessions end. An access token already
--                             issued stays valid at the API until it expires
--                             (at most the project's JWT lifetime, 1 hour by
--                             default) - migration 0242 closes that window.
--   Student ................. no change; cannot call the function (refused).
--   anon .................... no change; EXECUTE revoked.
--   Super Admin ............. no change; not accepted by the function (it is
--                             the Owner's tool - a Super Admin has the dashboard).
--
-- CALLERS
--   New: web/app/school/staff/actions.ts (setStaffLoginDisabled) and
--   web/app/school/employees/actions.ts (archiveEmployee, optional step).
--   Nothing existing reads or writes the new column or function.
--
-- NOT VERIFIED (needs one check on a branch database before production)
--   That this project's GoTrue version refuses a banned user on
--   /token?grant_type=password and on refresh, and that supabase.auth.getUser()
--   fails once the session row is gone. Both are documented behaviour; neither
--   was run. tests/integration/staff-login-disable.test.ts asserts them.
--
-- PRE-CHECK (read-only; run before applying, keep the output)
--   -- 1. Column and function are not there yet (expect 0 rows, 0 rows).
--   select 1 from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles' and column_name = 'login_disabled_at';
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_staff_login_disabled';
--
--   -- 2. The pieces it relies on exist (expect 5 rows).
--   select 'owner_manages_staff' as needs where to_regprocedure('public.owner_manages_staff(uuid)') is not null
--   union all select 'record_audit' where exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'record_audit')
--   union all select 'auth.sessions' where to_regclass('auth.sessions') is not null
--   union all select 'auth.refresh_tokens' where to_regclass('auth.refresh_tokens') is not null
--   union all select 'auth.one_time_tokens' where to_regclass('auth.one_time_tokens') is not null;
--
--   -- 3. Logins this is for: Staff Users whose linked Employee is archived.
--   --    (Test School A has one today, "UXA-People Emp Test" - issue #686.)
--   select p.school_id, p.id, p.full_name, e.full_name as employee, e.archived_at
--     from public.profiles p
--     join public.employees e on e.profile_id = p.id
--    where p.role = 'staff_user' and e.archived_at is not null
--    order by p.school_id, e.archived_at;
--
--   -- 4. Nobody is already banned by hand (expect 0 rows; a row here would be
--   --    left alone - the function only lifts a ban it set itself).
--   select u.id, u.banned_until from auth.users u
--     join public.profiles p on p.id = u.id
--    where p.role = 'staff_user' and u.banned_until is not null;
--
-- ROLLBACK (exact, in this order). If 0242 is applied, roll 0242 back FIRST:
-- its app_current_school_id() reads the column dropped here.
--   -- a. Turn every login this feature disabled back on, so nobody stays
--   --    locked out by a column that is about to disappear.
--   update auth.users u set banned_until = null
--     from public.profiles p
--    where p.id = u.id and p.login_disabled_at is not null;
--   -- b. Remove the objects.
--   drop function if exists public.set_staff_login_disabled(uuid, boolean);
--   alter table public.profiles drop constraint if exists profiles_login_disabled_staff_only;
--   alter table public.profiles drop column if exists login_disabled_at;
--   notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 1. The marker. The Owner already reads their School's profiles
--    ("school owner reads own school profiles", 0001); a Staff User reads only
--    their own row. No policy changes.
alter table public.profiles
  add column if not exists login_disabled_at timestamptz;

comment on column public.profiles.login_disabled_at is
  'When the School Owner turned this Staff User login off (issue #688). Null = the login works. Set and cleared only by set_staff_login_disabled().';

-- Only a Staff User row can carry it: a School Owner, Student or vendor
-- profile can never be marked disabled, whatever writes the column.
alter table public.profiles drop constraint if exists profiles_login_disabled_staff_only;
alter table public.profiles add constraint profiles_login_disabled_staff_only
  check (login_disabled_at is null or role = 'staff_user');

-- ---------------------------------------------------------------------------
-- 2. The switch.
--
-- search_path stays `public`; the three auth tables are schema-qualified.
-- A finite date, not 'infinity': GoTrue reads banned_until into a Go time
-- value, which cannot hold infinity.
create or replace function public.set_staff_login_disabled(p_staff uuid, p_disabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_was_disabled boolean;
begin
  -- School Owner, and the target is a Staff User of the Owner's own School
  -- (0002). Refuses every other caller and every other target, including the
  -- Owner's own id.
  if p_staff is null or p_disabled is null or not public.owner_manages_staff(p_staff) then
    raise exception 'only a School Owner can turn a staff login of their own School off or on';
  end if;

  select school_id, login_disabled_at is not null
    into v_school, v_was_disabled
    from profiles where id = p_staff for update;

  if p_disabled then
    update auth.users
       set banned_until = now() + interval '100 years', updated_at = now()
     where id = p_staff;
    delete from auth.sessions where user_id = p_staff;
    delete from auth.refresh_tokens where user_id = p_staff::text;
    delete from auth.one_time_tokens where user_id = p_staff;
    update profiles set login_disabled_at = coalesce(login_disabled_at, now()) where id = p_staff;
  else
    -- Lift only a ban this function set: a login banned by hand in the
    -- dashboard has no login_disabled_at and is left alone.
    if v_was_disabled then
      update auth.users set banned_until = null, updated_at = now() where id = p_staff;
    end if;
    update profiles set login_disabled_at = null where id = p_staff;
  end if;

  -- 'update': audit_log_action_check is a fixed vocabulary (see 0132).
  perform public.record_audit('staff_login', p_staff::text, 'update',
    v_school, null,
    jsonb_build_object('disabled', v_was_disabled),
    jsonb_build_object('event', case when p_disabled then 'login_disabled' else 'login_enabled' end,
                       'disabled', p_disabled),
    null, null, null, null);
end $$;

comment on function public.set_staff_login_disabled(uuid, boolean) is
  'School Owner turns one Staff User login of their own School off (blocks sign-in, ends sessions) or on. Deletes nothing: grants and the employees link stay, so "on" restores the same access. Issue #688.';

-- 0150's pattern: CREATE FUNCTION grants EXECUTE to PUBLIC, and anon reaches a
-- function through that grant, so PUBLIC is what has to go.
revoke execute on function public.set_staff_login_disabled(uuid, boolean) from public;
revoke execute on function public.set_staff_login_disabled(uuid, boolean) from anon;
grant execute on function public.set_staff_login_disabled(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0243_approvals_scoped_to_reach.sql
-- ===========================================================================
-- 0243_approvals_scoped_to_reach.sql
-- Issue #689 (Approvals inbox and dashboard count are school-wide for any
-- member). Index item 1.4.
-- WRITTEN, NOT APPLIED. The app works with and without it: the Approvals page
-- and the dashboard count already apply the same rule in TypeScript
-- (web/lib/school/approvals-reach.ts); this makes the database agree.
--
-- WHAT
--   A school member reads a workflow instance (and its steps, comments and
--   attachments) only when it is in their reach:
--     a. the School Owner: every instance of their School (unchanged);
--     b. an approver of the instance's CURRENT stage - workflow_stages names
--        their role or their user id (the same test workflow_decide applies);
--     c. the person who started it;
--     d. someone who already decided an earlier stage of it;
--     e. office staff (a Staff User with no employees row) holding the
--        Attendance grant, for the two attendance workflows
--        (leave_approval, attendance_correction).
--   Today the rule is only "same School".
--
-- WHY
--   `approvals` is a `member` screen (ADR 0020), so every Staff User can open
--   it, and "members read own instances" (0082) gives them the whole School's
--   queue: a login with no Permission Grant saw 343 pending items and their
--   count on the dashboard. None of them could decide any of it - every seeded
--   stage names school_owner.
--
-- DECISION TAKEN (open in the issue; the owner can reverse it)
--   "Show only what the viewer can act on or is party to", plus (e) so that
--   office staff who run Attendance keep the leave queue they see today. What
--   (e) shows them is nothing new: employee_leaves and student_leaves are
--   already readable with that grant (0136). A workflow definition added later
--   is NOT in (e) until someone adds it here: unknown means Owner, approvers
--   and parties only.
--
-- EFFECT ON EXISTING DATA
--   None. One function added, one function redefined, one policy replaced.
--
-- EFFECT PER ROLE
--   School Owner ............ no change: every instance of their School.
--   Office staff + Attendance  no change for leave_approval and
--                             attendance_correction instances. Loses sight of
--                             any other definition's instances unless (b)-(d).
--   Office staff, no Attendance grant
--                             LOSES the school-wide list and count (this is
--                             the leak in the issue). Keeps (b)-(d).
--   Class teacher / subject teacher
--                             LOSES the school-wide list and count. Keeps (b)-(d).
--   Student ................. no change (never a school member here, 0131).
--   anon .................... no change (no access).
--   Super Admin ............. no change ("super admin reads instances" untouched).
--   Nobody loses the ability to DECIDE: workflow_decide is SECURITY DEFINER
--   and reads the instance by id, not through this policy.
--
-- WHO RELIES ON THE OLD ACCESS, AND WHY THEY STILL WORK
--   web/app/school/approvals/page.tsx     lists in_progress instances: now the
--                                         caller's reach; the Owner's list is unchanged.
--   web/app/school/page.tsx               the pending-approvals count: same.
--   web/lib/engines/workflow/engine.ts    status(id): the caller is the initiator (c)
--                                         or the Owner (a) wherever it is used
--                                         (web/lib/school/leave-approval.ts, tests).
--   workflow_instance_visible(uuid)       guards the read policies on workflow_steps,
--                                         workflow_comments, workflow_attachments and
--                                         the RPCs workflow_comment / workflow_attach
--                                         (0084). Redefined below to the same reach, so
--                                         who can read an instance = who can read and
--                                         add its comments.
--   workflow_start, workflow_decide, workflow_leave_sync (0084, 0105)
--                                         SECURITY DEFINER, read by id: unaffected.
--   web/app/super-admin/workflows/*       Super Admin policy: unaffected.
--   web/lib/partner/index.ts              distributor onboarding, school_id null:
--                                         never matched the member policy: unaffected.
--   Integration tests: workflow-engine.test.ts and leave-workflow.test.ts act as
--   the Owner (a) and assert another School's Owner sees nothing (still true).
--
-- PRE-CHECK (read-only; run before applying, keep the output)
--   -- 1. The policy and function being replaced are the ones from 0082/0084.
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'workflow_instances' order by policyname;
--   select pg_get_functiondef('public.workflow_instance_visible(uuid)'::regprocedure);
--
--   -- 2. Which stages name someone other than the Owner. Every row here is a
--   --    role or user that KEEPS its instances through rule (b).
--   select definition_key, seq, approver_role, approver_user from public.workflow_stages
--    where approver_role is distinct from 'school_owner' or approver_user is not null
--    order by 1, 2;
--
--   -- 3. Definitions with school instances. Anything besides leave_approval and
--   --    attendance_correction is NOT covered by rule (e): decide whether office
--   --    staff should see it before applying.
--   select definition_key, status, count(*) from public.workflow_instances
--    where school_id is not null group by 1, 2 order by 1, 2;
--
--   -- 4. Instances started by someone who is not the Owner (they keep theirs, rule c).
--   select p.role, count(*) from public.workflow_instances wi
--     join public.profiles p on p.id = wi.initiator_id
--    where wi.school_id is not null group by 1;
--
-- ROLLBACK (exact, in this order; restores 0082/0084)
--   drop policy if exists "members read instances in reach" on public.workflow_instances;
--   create policy "members read own instances" on public.workflow_instances
--     for select using (school_id is not null and school_id = public.app_current_school_id());
--   create or replace function public.workflow_instance_visible(p_instance uuid)
--     returns boolean language sql stable security definer set search_path = public as $$
--     select exists (
--       select 1 from public.workflow_instances wi
--       where wi.id = p_instance and public.app_tenant_member(wi.school_id)
--     );
--   $$;
--   drop function if exists public.workflow_instance_in_reach(uuid, uuid, text, integer, uuid);
--   notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 1. The rule, once. Takes the row's own columns so the policy does not read
--    workflow_instances a second time.
create or replace function public.workflow_instance_in_reach(
  p_instance uuid,
  p_school uuid,
  p_definition text,
  p_seq integer,
  p_initiator uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select p_school is not null
     and p_school = public.app_current_school_id()
     and (
       -- a. the Owner
       public.app_current_role() = 'school_owner'
       -- c. started it
       or p_initiator = auth.uid()
       -- b. approver of the current stage (workflow_decide's own test)
       or exists (
         select 1 from workflow_stages s
          where s.definition_key = p_definition and s.seq = p_seq
            and ((s.approver_role is not null and s.approver_role = public.app_current_role())
              or (s.approver_user is not null and s.approver_user = auth.uid()))
       )
       -- d. decided an earlier stage
       or exists (
         select 1 from workflow_steps st
          where st.instance_id = p_instance and st.approver_id = auth.uid()
       )
       -- e. office staff who run Attendance, for the attendance workflows
       or (
         p_definition in ('leave_approval', 'attendance_correction')
         and public.app_current_role() = 'staff_user'
         and public.app_current_employee_id() is null
         and public.app_module_granted('attendance')
       )
     )
$$;

comment on function public.workflow_instance_in_reach(uuid, uuid, text, integer, uuid) is
  'May the calling school member read this workflow instance? Owner; current-stage approver; initiator; earlier decider; office staff with the Attendance grant for the attendance workflows. Issue #689.';

-- A policy helper: it is evaluated with the privileges of the role making the
-- request, so it keeps the default EXECUTE (0150 explains why revoking PUBLIC
-- on a policy helper turns "no rows" into "permission denied for function").
-- It answers false for anon and for a Student: app_current_school_id() is null.

-- ---------------------------------------------------------------------------
-- 2. The instance policy.
drop policy if exists "members read own instances" on public.workflow_instances;
drop policy if exists "members read instances in reach" on public.workflow_instances;
create policy "members read instances in reach" on public.workflow_instances
  for select using (
    public.workflow_instance_in_reach(id, school_id, definition_key, current_seq, initiator_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Steps, comments and attachments follow the instance, as before.
create or replace function public.workflow_instance_visible(p_instance uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workflow_instances wi
    where wi.id = p_instance
      and (public.app_current_role() = 'super_admin'
        or public.workflow_instance_in_reach(wi.id, wi.school_id, wi.definition_key, wi.current_seq, wi.initiator_id))
  );
$$;

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0244_student_roll_unique_in_offering.sql
-- ===========================================================================
-- 0244_student_roll_unique_in_offering.sql
-- Issue #690 (Two students can be saved with the same roll in one class).
-- Index item 3.5.
-- WRITTEN, NOT APPLIED. The app works with and without it (the same check runs
-- in web/lib/school/roll-check.ts before a roll is written).
--
-- WHAT WAS FOUND (by reading the migrations and the code; the live database
-- was NOT queried - the pre-check below is how to confirm it)
--   Both uniqueness rules the issue asks about exist in the migrations:
--     students_roll_unique              (0120) unique (school_id, class_name,
--                                       coalesce(section,''), roll_number)
--                                       where roll_number and class_name are not null
--     student_enrollments_roll_unique   (0181) unique (class_offering_id, roll_number)
--                                       where roll_number is not null and closed_at is null
--   A later browser check could not reproduce the issue for ADMISSION: the
--   second student with the same roll was refused in Bangla.
--   The gap that remains is the EDIT form. It writes only students.roll_number
--   (the copy lists, ID cards and print pages show) and never the Enrollment's
--   roll. students_roll_unique is keyed on class TEXT, so it does not fire when
--   the Student's class_name is empty or differs from a classmate's - while
--   both are current members of the same Class Offering. Two Students of one
--   Offering can then show the same roll and neither index objects.
--
-- WHAT
--   A BEFORE UPDATE OF roll_number trigger on public.students. When a Student
--   who is placed in a Class Offering gets a roll that is NOT the one their own
--   Enrollment carries (so: a manual edit), the trigger refuses it if another
--   current member of that Offering holds the same number in either copy. It
--   raises SQLSTATE 23505 naming "students_roll_unique", so the app shows its
--   existing "that roll is taken" message (friendlyStudentError).
--
-- WHY A TRIGGER AND NOT A UNIQUE INDEX
--   A unique index is checked against every existing row when it is created and
--   fails if one duplicate exists. This must not fail on existing duplicate
--   rolls, so it checks only rows being written from now on. Existing
--   duplicates stay exactly as they are and can still be saved unchanged.
--
-- WHAT IT DELIBERATELY LETS THROUGH
--   - A write that sets the legacy roll to the Student's own Enrollment roll.
--     That is the sync step after admission, transfer and promotion
--     (admitStudent, sync_student_legacy_placement - 0186). The Enrollment roll
--     is already unique per Offering (0181), so these never need a second look,
--     and bulk promotion cannot be blocked by another Student's stale legacy roll.
--   - A Student with no placement (current_enrollment_id null) and a null roll.
--   - INSERT: at admission the placement does not exist yet; the app pre-check
--     and student_enrollments_roll_unique cover that path.
--
-- EFFECT ON EXISTING DATA
--   None. No row is read into a change, rewritten or deleted.
--
-- EFFECT PER ROLE
--   School Owner, office staff, class teacher (the roles that can edit a
--   Student): a manual roll edit to a number a classmate already holds is now
--   refused with the existing message. Every other edit is unchanged.
--   Subject teacher, Student, anon: no change (they cannot update students).
--
-- CALLERS OF A students.roll_number UPDATE, AND WHY THEY STILL WORK
--   web/app/school/students/actions.ts updateStudent   the edit form: now checked (intended).
--   web/app/school/students/actions.ts admitStudent    sync to the Enrollment roll: let through.
--   sync_student_legacy_placement (0186)               p_new_roll is the Enrollment roll: let
--     (transferStudent, the Promotion action)          through; null (scope changed): let through.
--   assign_student_roll (0120)                         BEFORE INSERT only: this trigger does not fire.
--   Nothing else writes the column (grep over web/app, web/lib, web/supabase/migrations).
--
-- PRE-CHECK (read-only; run before applying, keep the output). Queries 1-2
-- answer the issue's "not yet known"; 3-5 size the cleanup. None of them has
-- to return zero for this file to apply.
--   -- 1. The two indexes exist, are valid, and cover what the migrations say.
--   select c.relname, i.indisunique, i.indisvalid, pg_get_indexdef(i.indexrelid)
--     from pg_index i join pg_class c on c.oid = i.indexrelid
--    where c.relname in ('students_roll_unique', 'student_enrollments_roll_unique');
--   --    Expect 2 rows, both unique and valid. If one is MISSING or invalid and
--   --    query 3 (for the enrollment index) or query 4 (for the students index)
--   --    returns no rows, it can be re-created with the statement from 0181 /
--   --    0120. If duplicates exist, clean them first - do not force it.
--
--   -- 2. The issue's two test students ("FIX-People ... R1" / "... R2").
--   select s.id, s.full_name, s.class_name, s.section, s.roll_number as shown_roll,
--          e.class_offering_id, e.roll_number as enrollment_roll, e.closed_at, s.archived_at
--     from public.students s
--     left join public.student_enrollments e on e.id = s.current_enrollment_id
--    where s.full_name like 'FIX-People%'
--    order by s.full_name;
--
--   -- 3. Duplicate ENROLLMENT rolls in one Offering (expect 0 rows while the index is valid).
--   select class_offering_id, roll_number, count(*) from public.student_enrollments
--    where roll_number is not null and closed_at is null
--    group by 1, 2 having count(*) > 1;
--
--   -- 4. Duplicate SHOWN rolls in one Offering - what a user sees as the bug.
--   select e.class_offering_id, s.roll_number, count(*) as students, array_agg(s.id) as student_ids
--     from public.students s
--     join public.student_enrollments e on e.id = s.current_enrollment_id and e.closed_at is null
--    where s.roll_number is not null
--    group by 1, 2 having count(*) > 1
--    order by 1, 2;
--
--   -- 5. Students whose two copies disagree (drift from earlier edits).
--   select count(*) from public.students s
--     join public.student_enrollments e on e.id = s.current_enrollment_id and e.closed_at is null
--    where s.roll_number is distinct from e.roll_number;
--
-- ROLLBACK (exact, in this order)
--   drop trigger if exists student_roll_unique_in_offering on public.students;
--   drop function if exists public.enforce_student_roll_unique_in_offering();
--   notify pgrst, 'reload schema';

create or replace function public.enforce_student_roll_unique_in_offering() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_offering uuid;
  v_enrollment_roll integer;
begin
  -- Nothing to check: no roll, no placement, or the roll did not change.
  if new.roll_number is null
     or new.current_enrollment_id is null
     or new.roll_number is not distinct from old.roll_number then
    return new;
  end if;

  select e.class_offering_id, e.roll_number
    into v_offering, v_enrollment_roll
    from student_enrollments e
   where e.id = new.current_enrollment_id and e.closed_at is null;
  if v_offering is null then
    return new;
  end if;

  -- The sync after admission / transfer / promotion: already unique by 0181.
  if v_enrollment_roll is not distinct from new.roll_number then
    return new;
  end if;

  -- Same lock assign_enrollment_roll takes (0181), so two edits into one
  -- Offering cannot both pass the check below.
  perform pg_advisory_xact_lock(hashtextextended(v_offering::text, 0));

  if exists (
    select 1
      from student_enrollments e
      join students s on s.current_enrollment_id = e.id
     where e.class_offering_id = v_offering
       and e.closed_at is null
       and s.id <> new.id
       and (s.roll_number = new.roll_number or e.roll_number = new.roll_number)
  ) then
    raise exception using
      errcode = 'unique_violation',
      constraint = 'students_roll_unique',
      message = 'duplicate key value violates unique constraint "students_roll_unique"',
      detail = format('Roll %s is already held in this class offering.', new.roll_number);
  end if;

  return new;
end $$;

-- A trigger function needs no EXECUTE grant: the trigger mechanism does not
-- check it. Closing the default grant only removes it as an RPC (0150).
revoke execute on function public.enforce_student_roll_unique_in_offering() from public;
revoke execute on function public.enforce_student_roll_unique_in_offering() from anon;
revoke execute on function public.enforce_student_roll_unique_in_offering() from authenticated;

drop trigger if exists student_roll_unique_in_offering on public.students;
create trigger student_roll_unique_in_offering
  before update of roll_number on public.students
  for each row execute function public.enforce_student_roll_unique_in_offering();

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0245_revoke_is_absent_working_day.sql
-- ===========================================================================
-- 0245_revoke_is_absent_working_day.sql
-- Migration index #703, item 4.6.
-- WRITTEN, NOT APPLIED. Apply AFTER 0218 (which redefines the same function
-- with `create or replace`, keeping its grants). Applying this first is also
-- safe - a later `create or replace` keeps the revoked state - but the order
-- above is the one that was reasoned about.
--
-- WHAT
--   Removes EXECUTE on public.is_absent_working_day(uuid, uuid, date) from
--   public, anon and authenticated. The function itself is not changed.
--
-- WHY
--   It is SECURITY DEFINER, takes a student id, a school id and a date, checks
--   no caller, and has had Postgres' default EXECUTE-to-PUBLIC since 0021. So
--   anyone holding the public anon key and a student id can ask whether that
--   Student had an attendance record or approved leave on a date.
--
-- EFFECT ON EXISTING DATA
--   None.
--
-- EFFECT PER ROLE
--   Nobody uses it directly: no app code calls it (grep over web/app, web/lib,
--   web/components). Every role keeps every screen it has. Calling it straight
--   through the API now answers "permission denied" for School Owner, office
--   staff, class teacher, subject teacher, Student and anon alike.
--
-- WHO CALLS IT, AND WHY THEY STILL WORK
--   All six SQL callers are SECURITY DEFINER, so the call inside them runs as
--   the function owner, who keeps EXECUTE whatever is revoked from other roles:
--     absence_sms_candidates(text, date)                 0046
--     absent_working_days_in_month(uuid, int, int)        0039
--     absent_working_days_in_range(uuid, date, date)      0146
--     student_absent_working_days(date, date)             0146
--     student_class_attendance_days(date, date)           0218
--     (0217's student_attendance_summary / school_attendance_summary are
--      SECURITY INVOKER but do not call it.)
--   Tests that called it directly are changed in the same commit to ask
--   absent_working_days_in_range for the one day instead, which gives the same
--   answer before and after this file:
--     web/tests/integration/absence-sms.test.ts           (was anon)
--     web/tests/integration/absent-day-weekly-off.test.ts (was the Owner)
--
-- PRE-CHECK (read-only; run before applying, keep the output)
--   -- 1. The signature exists exactly once (expect 1 row).
--   select oid::regprocedure, prosecdef from pg_proc
--    where pronamespace = 'public'::regnamespace and proname = 'is_absent_working_day';
--
--   -- 2. The live grants (expect PUBLIC / anon / authenticated to hold EXECUTE today).
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name = 'is_absent_working_day';
--
--   -- 3. Every function whose body calls it is SECURITY DEFINER.
--   --    Expect prosecdef = true on every row except is_absent_working_day
--   --    itself. A row with prosecdef = false is a caller that would BREAK:
--   --    stop and do not apply.
--   select p.oid::regprocedure, p.prosecdef
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.prosrc ilike '%is_absent_working_day%'
--    order by 1;
--
--   -- 4. No policy or view calls it (expect 0 rows, 0 rows). A policy is
--   --    evaluated as the requesting role and would break.
--   select schemaname, tablename, policyname from pg_policies
--    where coalesce(qual, '') || coalesce(with_check, '') ilike '%is_absent_working_day%';
--   select schemaname, viewname from pg_views
--    where schemaname = 'public' and definition ilike '%is_absent_working_day%';
--
-- ROLLBACK (exact; restores the default grants)
--   grant execute on function public.is_absent_working_day(uuid, uuid, date) to public;
--   grant execute on function public.is_absent_working_day(uuid, uuid, date) to anon, authenticated;
--   notify pgrst, 'reload schema';

revoke execute on function public.is_absent_working_day(uuid, uuid, date) from public;
revoke execute on function public.is_absent_working_day(uuid, uuid, date) from anon;
revoke execute on function public.is_absent_working_day(uuid, uuid, date) from authenticated;

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0252_notice_unpublish.sql
-- ===========================================================================
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

-- ===========================================================================
-- FILE 0253_student_message_thread.sql
-- ===========================================================================
-- 0253_student_message_thread.sql
-- Issue #703 item 5.4: a follow-up question belongs to its original.
-- DRAFT: written by an agent, applied by hand after review. One nullable
-- column, one index, one trigger. No row is rewritten or deleted. Safe to run
-- twice.
--
-- WHAT
--   student_messages.thread_id uuid, null by default, referencing
--   student_messages(id).
--     NULL          = a row written before this migration, or by app code that
--                     does not know the column. Grouped as today (same anchor
--                     and same title: lib/student/question-threads.ts).
--     = the row's id = a new original question (the app sets it on insert).
--     = another id   = a follow-up to that original.
--   A trigger refuses a thread_id that is not an original question of the
--   SAME Student.
--
-- WHY
--   Follow-ups are grouped by convention (same anchor, same title), so two
--   unrelated questions with one title merge, and the teacher's inbox shows a
--   follow-up without the earlier messages.
--
-- CHOICES
--   * thread_id, not parent_id: with "= own id" a NEW original is told apart
--     from an OLD row without touching any old row. Old rows keep the title
--     convention; new rows never merge by title.
--   * No backfill: which old rows are follow-ups is only a guess (the title
--     convention). They stay NULL.
--   * The app sets thread_id, not a column default or trigger: app code
--     deployed before this file keeps writing NULL and keeps today's grouping.
--   * ON DELETE SET NULL: if an original is removed (item 5.8 lets a Student
--     withdraw an unanswered question) its follow-ups stay, as old-style rows.
--
-- WHO MAY READ / WRITE WHAT
--   No policy changes. A Student still reads and inserts only their own rows
--   (0148: student_id = app_current_student_id()). The new trigger adds that a
--   Student cannot attach a question to somebody else's thread: the original
--   must have the same student_id as the new row. Staff reads are unchanged
--   (0152).
--
-- EFFECT ON EXISTING DATA
--   None: every existing row gets NULL (nullable column, no default, no table
--   rewrite). The Student's list groups them exactly as before.
--
-- THE APP BEFORE AND AFTER
--   Before: the app reads without the column and, on insert, retries without
--   it when the column is missing (PGRST204 / 42703): today's behaviour.
--   After: new questions carry thread_id; the Student's list groups by it, and
--   the teacher's drawer shows the earlier messages of the same thread.
--
-- PRE-CHECK (read-only)
--   -- 1. Column absent (expect no rows):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'student_messages' and column_name = 'thread_id';
--   -- 2. Row count, for the record (nothing is changed):
--   select count(*) from student_messages;
--
-- ROLLBACK (trigger and function first: the function names the column)
--   drop trigger if exists student_message_thread on public.student_messages;
--   drop function if exists public.enforce_student_message_thread();
--   drop index if exists public.student_messages_thread_idx;
--   alter table public.student_messages drop column if exists thread_id;
--   notify pgrst, 'reload schema';
--   The app falls back to the title convention. Thread links stored in between
--   are lost; follow-ups with the same title still group as before.

alter table public.student_messages
  add column if not exists thread_id uuid references public.student_messages (id) on delete set null;

comment on column public.student_messages.thread_id is
  'The original question this row belongs to (#703 item 5.4). NULL = written before 0253 (grouped by anchor and title). Equal to id = an original question. Another id = a follow-up to it.';

create index if not exists student_messages_thread_idx on public.student_messages (thread_id);

-- A follow-up may only point at an original question of the same Student.
-- Definer so the lookup does not depend on which policies the writer has; it
-- reads one row by primary key and returns nothing to the caller.
create or replace function public.enforce_student_message_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.thread_id is null or new.thread_id = new.id then
    return new;
  end if;
  if not exists (
    select 1 from student_messages root
     where root.id = new.thread_id
       and root.student_id = new.student_id
       and root.school_id = new.school_id
       -- The target is itself an original: an old row (NULL) or a new one.
       and (root.thread_id is null or root.thread_id = root.id)
  ) then
    raise exception 'thread does not belong to this student';
  end if;
  return new;
end $$;

-- Trigger functions need no EXECUTE for anyone (0150 section 1).
revoke execute on function public.enforce_student_message_thread() from public, anon, authenticated;

drop trigger if exists student_message_thread on public.student_messages;
create trigger student_message_thread
  before insert or update of thread_id on public.student_messages
  for each row execute function public.enforce_student_message_thread();

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0254_student_message_replies.sql
-- ===========================================================================
-- 0254_student_message_replies.sql
-- Issue #703 item 5.6: several replies per question.
-- DRAFT: written by an agent, applied by hand after review. One new table with
-- its policies and one trigger. No existing table, row or policy is changed.
-- Safe to run twice.
--
-- WHAT
--   student_message_replies: one row per ADDITIONAL reply to a question.
--   The first reply stays where it is today, in student_messages.reply_body /
--   replied_by / replied_at; "answered" keeps its one definition (0153).
--
-- WHY
--   student_messages holds one reply per row. A teacher who wants to add to an
--   answer has nowhere to write, short of overwriting the first reply.
--
-- CHOICES
--   * Additional replies only. Moving the first reply into this table would
--     mean rewriting every answered row and every reader of reply_body
--     (inbox, response report, student home). Not done.
--   * A further reply does not change status or replied_at, so the response
--     report's reply times are unaffected.
--   * Body limit 4000 characters, the same number as item 5.5 (0256).
--   * Replies are not edited or deleted by School roles (no update or delete
--     policy), like the first reply's history.
--
-- WHO MAY READ / WRITE WHAT
--   Student: SELECT only, and only replies to their OWN questions. Enforced by
--     the policy "student reads replies to own messages": the reply's
--     student_id must equal app_current_student_id(). student_id is not
--     trusted from the writer: the trigger below copies it (and school_id)
--     from the question on every insert. A Student has no insert, update or
--     delete policy here.
--   Staff: SELECT a reply when they can read its question (the 0152 read rule
--     applies through the sub-select on student_messages, which runs under the
--     reader's own policies). INSERT only when staff_may_answer_message(id)
--     says they may answer that question (0152, ADR 0018), as themselves
--     (replied_by = auth.uid()), and only on a question that already has its
--     first reply.
--   Super Admin: all, as on student_messages.
--   anon: nothing.
--
-- EFFECT ON EXISTING DATA
--   None. A new, empty table.
--
-- THE APP BEFORE AND AFTER
--   Before: the reads of this table fail (PGRST205 / 42P01) and are treated as
--   "no further replies"; the "add a reply" form is not shown, and the action
--   returns a clear error instead of overwriting the first reply.
--   After: the teacher's drawer offers "add a reply" on an answered question;
--   the Student's conversation shows every reply in order.
--
-- PRE-CHECK (read-only)
--   -- 1. Table absent (expect null):
--   select to_regclass('public.student_message_replies');
--   -- 2. The helper this file relies on exists (expect one row each):
--   select proname from pg_proc where proname in ('staff_may_answer_message', 'app_current_student_id');
--
-- ROLLBACK (stored additional replies are lost; first replies are untouched)
--   drop table if exists public.student_message_replies;
--   drop function if exists public.stamp_student_message_reply_owner();
--   notify pgrst, 'reload schema';

create table if not exists public.student_message_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.student_messages (id) on delete cascade,
  -- Copied from the question by the trigger below; never taken from the writer.
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  body text not null check (btrim(body) <> '' and char_length(body) <= 4000),
  replied_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.student_message_replies is
  'Additional replies to a student question (#703 item 5.6). The first reply stays in student_messages.reply_body.';

create index if not exists student_message_replies_message_idx
  on public.student_message_replies (message_id, created_at);
create index if not exists student_message_replies_student_idx
  on public.student_message_replies (student_id);

-- school_id and student_id always come from the question itself.
create or replace function public.stamp_student_message_reply_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select m.school_id, m.student_id into new.school_id, new.student_id
    from student_messages m where m.id = new.message_id;
  if new.school_id is null then
    raise exception 'question not found';
  end if;
  return new;
end $$;

revoke execute on function public.stamp_student_message_reply_owner() from public, anon, authenticated;

drop trigger if exists student_message_reply_owner on public.student_message_replies;
create trigger student_message_reply_owner
  before insert on public.student_message_replies
  for each row execute function public.stamp_student_message_reply_owner();

alter table public.student_message_replies enable row level security;
revoke all on public.student_message_replies from anon;

drop policy if exists "student reads replies to own messages" on public.student_message_replies;
create policy "student reads replies to own messages" on public.student_message_replies
  for select using (student_id = public.app_current_student_id());

drop policy if exists "staff read replies to readable messages" on public.student_message_replies;
create policy "staff read replies to readable messages" on public.student_message_replies
  for select using (
    school_id = (select public.app_current_school_id())
    and exists (select 1 from public.student_messages m where m.id = message_id)
  );

drop policy if exists "staff add replies to answerable messages" on public.student_message_replies;
create policy "staff add replies to answerable messages" on public.student_message_replies
  for insert with check (
    school_id = (select public.app_current_school_id())
    and replied_by = auth.uid()
    and public.staff_may_answer_message(message_id)
    and exists (
      select 1 from public.student_messages m
       where m.id = message_id and (m.status = 'answered' or m.reply_body is not null)
    )
  );

drop policy if exists "super admin manages student message replies" on public.student_message_replies;
create policy "super admin manages student message replies" on public.student_message_replies
  for all using (public.app_current_role() = 'super_admin');

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0255_student_message_reads.sql
-- ===========================================================================
-- 0255_student_message_reads.sql
-- Issue #703 item 5.2: which reply has the Student not seen yet.
-- DRAFT: written by an agent, applied by hand after review. One new table with
-- its policies. No existing table, row or policy is changed. Safe to run twice.
--
-- WHAT
--   student_message_reads: one row per question the Student has opened, with
--   the time they last opened it (seen_at). A reply is "new" when it is later
--   than seen_at, or when there is no row.
--
-- WHY
--   "Answered but not yet seen" cannot be shown: nothing records that the
--   Student has read a reply.
--
-- CHOICES
--   * A separate table, not a column on student_messages. A Student has no
--     UPDATE on student_messages by design (0148: the reply and the status
--     live on that row), and ANY update of an old answered row would make the
--     0154 trigger stamp replied_at = now() on rows answered without a time,
--     inventing reply times in the response report.
--   * The Student writes their own marker directly under RLS; no definer
--     function is needed.
--   * No backfill. The app counts a reply as new only for 14 days
--     (NEW_REPLY_DAYS in lib/student/question-threads.ts), so on the day this
--     is applied a Student sees "new reply" only on replies of the last two
--     weeks, not on their whole history.
--
-- WHO MAY READ / WRITE WHAT
--   Student: select, insert and update ONLY rows whose student_id is their own
--     (student_id = app_current_student_id() in USING and WITH CHECK), and
--     only for a question that is their own (the EXISTS on student_messages,
--     which itself runs under "student reads own messages"). No delete.
--   Staff: nothing. Whether a Student has read a reply is not shown to the
--     School in this change.
--   Super Admin: all. anon: nothing.
--
-- EFFECT ON EXISTING DATA
--   None. A new, empty table.
--
-- THE APP BEFORE AND AFTER
--   Before: the read fails (PGRST205 / 42P01) and is treated as "unknown": no
--   "new reply" mark anywhere, as today. The write is skipped silently; it
--   stores nothing the Student typed.
--   After: the Student's question list marks conversations with a new reply,
--   and opening one clears the mark.
--
-- PRE-CHECK (read-only)
--   select to_regclass('public.student_message_reads');   -- expect null
--
-- ROLLBACK (the markers are lost; nothing else depends on them)
--   drop table if exists public.student_message_reads;
--   notify pgrst, 'reload schema';

create table if not exists public.student_message_reads (
  message_id uuid primary key references public.student_messages (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  seen_at timestamptz not null default now()
);

comment on table public.student_message_reads is
  'When a Student last opened one of their own questions (#703 item 5.2). A reply later than seen_at is new to them.';

create index if not exists student_message_reads_student_idx on public.student_message_reads (student_id);

alter table public.student_message_reads enable row level security;
revoke all on public.student_message_reads from anon;

drop policy if exists "student reads own message reads" on public.student_message_reads;
create policy "student reads own message reads" on public.student_message_reads
  for select using (student_id = public.app_current_student_id());

drop policy if exists "student marks own message read" on public.student_message_reads;
create policy "student marks own message read" on public.student_message_reads
  for insert with check (
    student_id = public.app_current_student_id()
    and exists (
      select 1 from public.student_messages m
       where m.id = message_id and m.student_id = public.app_current_student_id()
    )
  );

drop policy if exists "student updates own message read" on public.student_message_reads;
create policy "student updates own message read" on public.student_message_reads
  for update using (student_id = public.app_current_student_id())
  with check (
    student_id = public.app_current_student_id()
    and exists (
      select 1 from public.student_messages m
       where m.id = message_id and m.student_id = public.app_current_student_id()
    )
  );

drop policy if exists "super admin manages student message reads" on public.student_message_reads;
create policy "super admin manages student message reads" on public.student_message_reads
  for all using (public.app_current_role() = 'super_admin');

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0256_student_message_body_length.sql
-- ===========================================================================
-- 0256_student_message_body_length.sql
-- Issue #703 item 5.5: a length limit on a question's text.
-- DRAFT: written by an agent, applied by hand after review. One CHECK
-- constraint, added NOT VALID. No row is rewritten or deleted. Safe to run
-- twice.
--
-- WHAT
--   CHECK student_message_body_length: char_length(body) <= 4000 on
--   student_messages. The app applies the same number in validateQuestion
--   (QUESTION_BODY_MAX in lib/student/messages.ts) and shows a counter.
--
-- WHY
--   The question body had no limit at all.
--
-- CHOICES
--   * 4000 characters: about two pages of text, counted on the stored
--     Markdown. Change the number here and in QUESTION_BODY_MAX together.
--   * The first reply (reply_body) is not limited here: it is written by
--     staff, and limiting it could refuse an update of an old long reply.
--
-- NOT VALID, AND WHAT THAT MEANS
--   Existing rows are not checked when the constraint is added, so adding it
--   cannot fail. But Postgres does check a NOT VALID constraint whenever a row
--   is inserted OR UPDATED. A teacher answering an old question longer than
--   4000 characters would therefore be refused. RUN THE PRE-CHECK: if it
--   returns 0, apply as written. If it returns rows, do not apply this file;
--   raise the number (here and in the app) above the longest body first.
--
-- WHO MAY READ / WRITE WHAT
--   No policy changes.
--
-- EFFECT ON EXISTING DATA
--   None stored. See NOT VALID above for the one way an existing row can be
--   affected.
--
-- THE APP BEFORE AND AFTER
--   The app enforces 4000 itself, before and after. This constraint only stops
--   a direct API write from going past it.
--
-- PRE-CHECK (read-only; expect over_limit = 0)
--   select count(*) filter (where char_length(body) > 4000) as over_limit,
--          max(char_length(body)) as longest
--     from student_messages;
--
-- ROLLBACK
--   alter table public.student_messages drop constraint if exists student_message_body_length;

alter table public.student_messages drop constraint if exists student_message_body_length;
alter table public.student_messages
  add constraint student_message_body_length check (char_length(body) <= 4000) not valid;

comment on constraint student_message_body_length on public.student_messages is
  'Question text is at most 4000 characters (#703 item 5.5). NOT VALID: rows older than 0256 were not checked.';

notify pgrst, 'reload schema';

-- ===========================================================================
-- FILE 0257_student_deletes_unanswered_question.sql
-- ===========================================================================
-- 0257_student_deletes_unanswered_question.sql
-- Issue #703 item 5.8: a Student can withdraw their own unanswered question.
-- DRAFT: written by an agent, applied by hand after review. One new policy.
-- No row is rewritten or deleted by this file. Safe to run twice.
--
-- WHAT
--   A DELETE policy on student_messages for the Student who asked, while the
--   question has no reply.
--
-- WHY
--   A question sent by mistake could not be withdrawn.
--
-- CHOICES (product decision taken the conservative way)
--   * Only while unanswered: status is not 'answered', and reply_body and
--     replied_at are both null (the same three facts isAnswered() reads).
--     Once a teacher has replied, the exchange stays.
--   * A question a teacher has merely opened (status 'read') can still be
--     withdrawn.
--   * No delete for School roles is added here (0172 notes there is none).
--
-- WHO MAY READ / WRITE WHAT
--   The policy is `student_id = app_current_student_id()` plus the unanswered
--   test, so a Student can delete only rows that are their own; another
--   Student's question never matches. app_current_student_id() is null for
--   anyone who is not an active Student, so the policy matches nothing for
--   staff or anon.
--
-- WHAT GOES WITH A DELETED QUESTION
--   * student_message_reads rows (0255): ON DELETE CASCADE.
--   * student_message_replies rows (0254): ON DELETE CASCADE, but there are
--     none, because a further reply needs a first reply.
--   * Follow-ups pointing at it (0253 thread_id): ON DELETE SET NULL; they
--     stay.
--   This file does not depend on 0253-0255 being applied.
--
-- EFFECT ON EXISTING DATA
--   None by itself. From then on a Student may delete their own unanswered
--   questions; the School loses sight of a withdrawn question (no audit copy
--   is kept).
--
-- THE APP BEFORE AND AFTER
--   Before: the delete matches no row and the app says the question could not
--   be withdrawn. After: the question is removed.
--
-- PRE-CHECK (read-only)
--   -- 1. No delete policy for Students yet (expect no row with cmd DELETE):
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'student_messages' order by cmd, policyname;
--   -- 2. How many questions are withdrawable right now, for the record:
--   select count(*) from student_messages
--    where status <> 'answered' and reply_body is null and replied_at is null;
--
-- ROLLBACK
--   drop policy if exists "student withdraws own unanswered question" on public.student_messages;

drop policy if exists "student withdraws own unanswered question" on public.student_messages;
create policy "student withdraws own unanswered question" on public.student_messages
  for delete using (
    student_id = public.app_current_student_id()
    and status <> 'answered'
    and reply_body is null
    and replied_at is null
  );

notify pgrst, 'reload schema';

commit;
