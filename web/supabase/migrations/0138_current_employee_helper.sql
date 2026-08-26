-- 0138_current_employee_helper.sql
-- Map #434 / ticket #443 follow-up.
--
-- "Which Employee am I?" is a question a Staff User must be able to ask about
-- THEMSELVES without being able to read the employees table. My Classes (#443)
-- asked it by selecting from `employees` on profile_id, which worked only
-- because that table was open to every school member — and 0136 closed it,
-- gating it on the Employees screen grant. A Class Teacher rarely holds that
-- grant, so the page would have told exactly the teachers it is built for that
-- their login is not linked to anything.
--
-- The answer is not to widen the grant or to add profile_id to employee_card
-- (which would let any staff member map every colleague to their login). It is
-- that the caller's own identity is one scalar, and a definer function is the
-- right shape for it — the same pattern app_current_student_id() already uses.
create or replace function public.app_current_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees where profile_id = auth.uid() and archived_at is null
$$;

revoke execute on function public.app_current_employee_id() from anon;
grant execute on function public.app_current_employee_id() to authenticated;
