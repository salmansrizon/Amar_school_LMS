-- 0156_employee_card_profile_id.sql
-- Map #434 / ticket #511: Response Performance accounts a question to whoever
-- answered it, and "whoever answered it" arrives in the wrong keyspace.
--
-- `student_messages.replied_by` references `profiles(id)` — a login. The report
-- keys its rows on `employees.id`, because the unanswered half comes from
-- `classes.class_teacher_id`. One column cannot hold both, so the report needs
-- to map a replier's login to their Employee record.
--
-- `employee_card` is the view that exists precisely so a caller without the
-- Employees grant can still read a colleague's name (0136). Its column list was
-- chosen narrowly and on purpose — "exactly what the nine cross-screen call
-- sites ask for and nothing more", with bank details and date of birth called
-- out as deliberately absent. This adds one column to it, so the widening is
-- recorded rather than assumed:
--
--   profile_id — the login this Employee signs in as, null when they have none.
--
-- What that discloses to a school member who could already read the card: which
-- login belongs to which Employee, inside their own school. Not a credential,
-- not a contact detail, and already derivable by anyone who can see both an
-- Employee list and a reply — which is the screen this exists for. Weighed
-- against the alternative (a second SECURITY DEFINER function returning the same
-- mapping, so the same fact is reachable by a longer route), one column on the
-- view whose job is already "names, for people without the grant" is the
-- smaller surface.
--
-- An Employee with no login keeps profile_id null: normal, and the reason the
-- report's unassigned bucket exists (#435).
--
-- Additive only — staging and main share one project. The column is appended,
-- so `select` lists that name their columns are untouched.
drop view if exists public.employee_card;
create view public.employee_card with (security_invoker = off, security_barrier = true) as
  select id, school_id, full_name, category, department, subject_taught,
         mobile, grace_override_minutes, archived_at, profile_id
    from public.employees
   where school_id = public.app_current_school_id();

grant select on public.employee_card to authenticated;
