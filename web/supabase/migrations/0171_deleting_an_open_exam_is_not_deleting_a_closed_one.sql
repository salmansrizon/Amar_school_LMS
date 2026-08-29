-- 0171_deleting_an_open_exam_is_not_deleting_a_closed_one.sql
-- Map #524. Found while running the integration suite, not reported by UAT.
--
-- An Owner could not delete an OPEN exam once it had a routine entry, a seat
-- plan, a mark or a subject teacher. The error was `exam is closed`, about an
-- exam whose status column said `open`.
--
-- enforce_exam_child_open_on_delete (0044) guards the children of a Closed exam:
-- delete a mark, and it refuses because the exam is closed. Correct, and it
-- also fires on the CASCADE from deleting the exam itself — by which point the
-- parent row is already gone, so exam_is_open() finds nothing and reads the
-- absence as "not open".
--
-- The guard exists to stop a child being removed out from under a Closed exam.
-- A parent that no longer exists is not that case: there is no exam left to
-- protect the integrity of. Deleting a Closed exam stays blocked one level up by
-- exam_close_immutable on `exams` (0037), which is the check that was always
-- meant to answer this question.
create or replace function public.enforce_exam_child_open_on_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() <> 'super_admin'
     and exists (select 1 from public.exams where id = old.exam_id)
     and not public.exam_is_open(old.exam_id) then
    raise exception 'exam is closed';
  end if;
  return old;
end $$;
