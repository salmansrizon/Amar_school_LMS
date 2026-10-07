-- 0217_employee_attendance_start.sql — issues #693 and #694 (second half).
-- WRITTEN, NOT APPLIED. The app works with and without it.
--
-- What
--   public.employee_attendance_starts(): for the caller's School, each
--   non-archived Employee's attendance START DAY — the first day an absence can
--   be inferred. Rows come back ONLY to the School Owner or a Staff User who
--   holds the `attendance` Permission Grant, and only for the caller's own
--   School. Two columns: employee_id and start_day. Nothing else of the row.
--
-- Why (#693)
--   The Employee attendance pages stop showing "absent" for days before an
--   Employee joined. They need joining_date and created_at to know the start
--   day, and read them from `employees`. That table is gated on the
--   `employees` Permission Grant (0136 section 3: every policy not already
--   gated is rewritten to `... and app_module_granted('employees')`), so a Class
--   Teacher or other Staff User holding `attendance` but not `employees` reads
--   zero rows and the clipping silently does not apply to them. The
--   employee_card view hides joining_date on purpose (0136, 0156, 0213), so it
--   cannot carry it. This function exposes the one derived date, not the column.
--
-- Start-day rule — identical to employeeTrackingStart() in
-- web/lib/employee-attendance-calendar.ts:
--   the LATER of joining_date and the Dhaka calendar day of created_at; if only
--   one is known, that one. (A veteran entered today has no earlier attendance
--   to be absent from.) Dhaka = Asia/Dhaka, the same zone as
--   SCHOOL_TIME_ZONE in web/lib/school-time.ts. greatest() skips nulls, which
--   is the TypeScript's "the other one" branch.
--
-- Gap B (#694, "no record / machine not synced") — NOTHING ADDED HERE.
--   The data cannot say "when did each machine last report": attendance_machines
--   (0213) is configuration only and holds no last-contact column, and
--   attendance_events (0017) carries card_number/tapped_at/created_at but no
--   machine id. The app instead defines "no record" from attendance_records
--   (see web/lib/employee-attendance-calendar.ts, isNoRecordDay). If a machine
--   health signal is wanted later, the smallest addition is a nullable
--   attendance_machines.last_seen_at that the Windows sync service (or the
--   ingest path) sets on each contact; it would stay empty until that writes it.
--
-- Not changed: no policy, table, view or existing function.
--
-- Rollback
--   drop function if exists public.employee_attendance_starts();
--   (The app falls back to its direct employees read when the function is
--   missing, so the rollback is safe at any time.)

create or replace function public.employee_attendance_starts()
returns table (employee_id uuid, start_day date)
language sql stable security definer set search_path = public as $$
  select e.id,
         greatest(e.joining_date, (e.created_at at time zone 'Asia/Dhaka')::date)
    from employees e
   where e.school_id = public.app_current_school_id()
     and e.archived_at is null
     and public.app_module_granted('attendance')
$$;

revoke execute on function public.employee_attendance_starts() from public;
revoke execute on function public.employee_attendance_starts() from anon;
grant execute on function public.employee_attendance_starts() to authenticated;

-- PostgREST learns the new shape at once; otherwise the app keeps taking its
-- "not applied yet" fallback until the schema cache reloads by itself.
notify pgrst, 'reload schema';
