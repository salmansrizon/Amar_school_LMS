-- Machine Attendance: the machine lifecycle functions follow the machine-write
-- rule (#677). FUNCTIONS ONLY: no table, column, constraint, policy or data
-- change.
--
-- WHY
--   _attendance_machine_for_caller (0217) admits Super Admin, or a caller in
--   the machine's School who holds the Attendance grant. A Class Teacher who
--   holds the grant for her own register could therefore archive, restore or
--   replace any machine of the School through the definer RPCs, although 0240
--   refuses her every direct write to attendance_machines.
--
-- WHAT
--   The helper now asks for the rule 0240 applies to attendance_machines
--   writes, through 0265's _attendance_machine_admin():
--     the Attendance grant AND (the School Owner OR a Staff User with no
--     employees row).
--   Unchanged: the machine must be in the caller's School; Super Admin passes
--   for any School; a refusal is the same 'attendance machine not found'
--   (P0002) as before, so nothing about another School's machine leaks.
--
-- CALLERS (every function that uses the helper, repo and live database
-- checked) - all of them change machines or queue device work:
--   archive_attendance_machine        (0264)
--   restore_attendance_machine        (0264)
--   replace_attendance_machine        (0264)
--   request_attendance_machine_test   (0265; already checked the same rule
--                                      itself, now redundant but kept)
--   No read path uses it, and there is no delete-if-unused function.
--
-- ROLLBACK
--   Re-create the helper with public.app_module_granted('attendance') in
--   place of public._attendance_machine_admin() (the 0217 body).

create or replace function public._attendance_machine_for_caller(target uuid)
returns public.attendance_machines
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines;
begin
  select * into m from attendance_machines where id = target for update;
  if m.id is null
     or not (public.app_current_role() = 'super_admin'
             or (m.school_id = public.app_current_school_id() and public._attendance_machine_admin())) then
    raise exception 'attendance machine not found' using errcode = 'P0002';
  end if;
  return m;
end $$;

revoke execute on function public._attendance_machine_for_caller(uuid) from public, anon, authenticated;
