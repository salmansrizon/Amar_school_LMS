-- 0157_student_withdraws_pending_leave.sql
-- Map #434 / audit fix: a leave request could be sent but never taken back.
--
-- A Student could create a request and nothing else — no update, no delete — so
-- a wrong date or a duplicate sat in the Owner's queue forever and the only
-- remedy was asking a human. Withdrawal is bounded by status: once the request
-- has been decided it is a record of a decision, not a draft, and stays.
--
-- Deleting the row is safe here: a student leave starts no workflow instance
-- (0105 syncs the other direction, from an instance onto the row), and the
-- attendance-correctness SQL only ever reads approved rows.

drop policy if exists "student withdraws own pending leave" on public.student_leaves;
create policy "student withdraws own pending leave" on public.student_leaves
  for delete using (
    student_id = (select public.app_current_student_id())
    and status = 'pending'
  );
