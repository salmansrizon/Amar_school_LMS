-- 0156_student_message_repliers.sql
-- Map #434 / ticket #511: Response Performance accounts a question to whoever
-- answered it, and "whoever answered it" arrives in the wrong keyspace.
--
-- `student_messages.replied_by` references `profiles(id)` — a login. The report
-- keys its rows on `employees.id`, because the unanswered half comes from
-- `classes.class_teacher_id`. One column cannot hold both, so the report needs
-- to map a replier's login to their Employee record.
--
-- The obvious move — add `profile_id` to `employee_card` — is the one 0138
-- explicitly refused:
--
--   "The answer is not to widen the grant or to add profile_id to
--    employee_card (which would let any staff member map every colleague to
--    their login)."
--
-- That reasoning still holds, and a first draft of this migration walked into it
-- anyway. So the mapping is a definer function instead, and it is narrow in the
-- way the view could not be: it returns a row only for a login that has ACTUALLY
-- REPLIED to a question in the caller's school. A colleague who has never
-- answered one is not in the result at all, so no general login-to-Employee
-- directory is disclosed — only the authorship the report is about to print on
-- the screen anyway.
--
-- Additive only — staging and main share one project.

-- ---------------------------------------------------------------------------
-- 1. Put employee_card back the way 0136 defined it.
--
-- No-op on any database that only ever saw this file. It exists because the
-- draft above was applied to the shared project before the contradiction with
-- 0138 was spotted, and the column has to come back off.
drop view if exists public.employee_card;
create view public.employee_card with (security_invoker = off, security_barrier = true) as
  select id, school_id, full_name, category, department, subject_taught,
         mobile, grace_override_minutes, archived_at
    from public.employees
   where school_id = public.app_current_school_id();

grant select on public.employee_card to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Who has answered a question here, and which Employee are they.
--
-- Definer, because the caller may hold no Employees grant — the same reason
-- employee_card exists (0136) and the same shape app_current_employee_id()
-- settled on (0138).
--
-- Scoped three ways, and each one matters:
--   - the caller's own school, so this crosses no tenant;
--   - repliers only, so it is not a directory;
--   - name and ids only, so it discloses nothing employee_card would not.
--
-- A Student reaches nothing: app_current_school_id() is null for role='student'
-- (0131), so the guard below returns an empty set rather than the whole school.
--
-- The School Owner is deliberately absent from the result. She replies and has
-- no `employees` row, so she has no employee id to return; the report gives her
-- her own bucket rather than inventing one (ADR 0019).
create or replace function public.student_message_repliers()
returns table (profile_id uuid, employee_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select distinct e.profile_id, e.id, e.full_name
    from public.student_messages m
    join public.employees e on e.profile_id = m.replied_by
   where public.app_current_school_id() is not null
     and m.school_id = public.app_current_school_id()
     and e.school_id = public.app_current_school_id()
     and m.replied_by is not null
$$;

revoke execute on function public.student_message_repliers() from anon;
grant execute on function public.student_message_repliers() to authenticated;
