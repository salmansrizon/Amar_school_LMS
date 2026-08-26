-- 0150_student_portal_rls_hardening.sql
--
-- Three findings from the /code-review pass over map #434 (PR #505) and the
-- Permission Grant fix (PR #506). None is a live leak; all three are load-bearing
-- lines that are not currently bearing load.
--
-- These cannot be fixed by editing 0130-0149: those are already applied to the
-- shared project, so a re-run is not coming.

-- ---------------------------------------------------------------------------
-- 1. `revoke execute ... from anon` never revoked anything.
--
-- 0138 and 0148 both say
--     revoke execute on function f from anon;
--     grant  execute on function f to authenticated;
-- and 0138's comment presents that as the protection. It is not. CREATE FUNCTION
-- grants EXECUTE to PUBLIC, and `anon` reaches the function through that grant,
-- not through one of its own — so revoking from `anon` removes a grant that was
-- never there and leaves PUBLIC standing. Confirmed against the project:
-- app_current_employee_id, student_profile_for, class_teacher_profile_for and
-- student_exam_rank all still answered has_function_privilege('anon', ..., 'EXECUTE').
--
-- create_student_login and set_student_password — the two that actually write
-- auth.users — were written with `from public` and were correctly closed. This
-- brings the rest of the map up to that standard.
--
-- Nothing leaked in the meantime: every function below already refuses an
-- unauthenticated caller on its own terms, because app_current_school_id(),
-- app_current_role() and app_current_student_id() are all null for anon. This is
-- the second lock, not the first.
--
-- DELIBERATELY NOT REVOKED — the policy helpers:
--   app_current_school_id, app_module_granted, app_is_student,
--   app_current_student_id, app_current_student_school_id,
--   student_in_class, student_matches_target
-- A policy expression is evaluated with the privileges of the role making the
-- request. 102 policies call app_current_school_id() and 41 call
-- app_module_granted(); revoking PUBLIC on those would turn every anonymous
-- PostgREST read of those tables from "no rows" into "permission denied for
-- function", which is a louder failure than the one being fixed.
do $$
declare f text;
begin
  foreach f in array array[
    -- Client-callable RPCs. Server components hold an authenticated session.
    'app_current_employee_id()',
    'apply_profile_change_request(uuid)',
    'class_teacher_profile_for(uuid, text, text)',
    'student_profile_for(uuid)',
    'student_exam_rank(uuid)',
    'student_absent_working_days(date, date)',
    'absent_working_days_in_range(uuid, date, date)',
    -- Trigger functions. The trigger mechanism does not check EXECUTE on the
    -- invoking role at all, so these need no grant to anyone — they were only
    -- ever reachable as an RPC, which is exactly what we are closing.
    'assign_student_no()',
    'drop_submission_object()',
    'enforce_change_request_refs()',
    'enforce_employee_profile_school()',
    'enforce_student_leave_pending()',
    'enforce_student_message_refs()',
    'enforce_student_no_immutable()',
    'enforce_submission_caps()',
    -- Read by enforce_submission_caps, which is definer and so runs as owner.
    'submission_max_bytes()',
    'submission_max_files()'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
  end loop;

  -- Re-grant only what a signed-in caller actually invokes.
  foreach f in array array[
    'app_current_employee_id()',
    'apply_profile_change_request(uuid)',
    'class_teacher_profile_for(uuid, text, text)',
    'student_profile_for(uuid)',
    'student_exam_rank(uuid)',
    'student_absent_working_days(date, date)',
    'absent_working_days_in_range(uuid, date, date)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Every student policy calls its definer helper once per row.
--
-- The convention this map set for itself: a definer predicate in a policy is
-- wrapped `(select ...)` or it re-evaluates per row. 0136's generated policies
-- follow it — `(SELECT app_module_granted('attendance'))`. None of the eighteen
-- student policies did. On attendance_records, the largest table a Student
-- touches, that is one security-definer call per scanned row.
--
-- Only the zero-argument helpers are wrapped. student_in_class(school_id, name,
-- section) and student_matches_target(...) take the ROW's own columns as
-- arguments, so they are not constant across the scan and cannot be hoisted into
-- an InitPlan — wrapping those would buy nothing and read as though it did.
--
-- Rewriting from pg_policies rather than by hand keeps each policy's own
-- predicate exactly as its migration wrote it; the only edit is the wrap.
do $$
declare p record;
        new_qual text;
        new_check text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'app_current_student(_school)?_id\(\)'
       -- Idempotent: a wrapped call renders as "( SELECT app_current_...".
       and (coalesce(qual,'') || coalesce(with_check,'')) !~ 'SELECT app_current_student'
  loop
    new_qual  := replace(replace(p.qual,
                   'app_current_student_school_id()', '(select public.app_current_student_school_id())'),
                   'app_current_student_id()',        '(select public.app_current_student_id())');
    new_check := replace(replace(p.with_check,
                   'app_current_student_school_id()', '(select public.app_current_student_school_id())'),
                   'app_current_student_id()',        '(select public.app_current_student_id())');

    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    if new_qual is null then
      execute format('create policy %I on %I.%I for %s to %s with check (%s)',
        p.policyname, p.schemaname, p.tablename, p.cmd, array_to_string(p.roles, ','), new_check);
    elsif new_check is null then
      execute format('create policy %I on %I.%I for %s to %s using (%s)',
        p.policyname, p.schemaname, p.tablename, p.cmd, array_to_string(p.roles, ','), new_qual);
    else
      execute format('create policy %I on %I.%I for %s to %s using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, p.cmd, array_to_string(p.roles, ','), new_qual, new_check);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. student_self is the one student view without a security barrier.
--
-- 0131 created it `with (security_invoker = off)` and stopped there. Every other
-- view on this map — student_routine, student_material, student_exam_result,
-- student_seat_assignment, student_fee_record, student_subject_option,
-- student_login_info — also sets security_barrier = true.
--
-- student_self is the one that matters most: it carries date_of_birth,
-- blood_group, student_mobile, guardian_name, guardian_mobile and the home
-- address. Without the barrier, a caller can put a non-leakproof function in the
-- WHERE clause and the planner may evaluate it below the view's own
-- `profile_id = auth.uid()` filter — against other students' rows in `students`.
alter view public.student_self set (security_barrier = true);
