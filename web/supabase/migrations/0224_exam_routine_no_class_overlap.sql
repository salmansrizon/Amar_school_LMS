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
