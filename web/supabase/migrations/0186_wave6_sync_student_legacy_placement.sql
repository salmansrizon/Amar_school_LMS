-- 0186_wave6_sync_student_legacy_placement.sql
-- Wave 6 (issue #591), step 5's actual precondition: dropping
-- student_transfers turned out to require retiring transfer_student() first,
-- discovered by checking live callers before dropping anything (transferStudent()
-- and the Promotion action both still called it as a second step, purely to
-- sync students.class_name/section/roll_number -- the "student_transfers'
-- retirement is explicitly undecided" comment on transferStudent() only ever
-- covered the HISTORY LOG half of that RPC's job, not the legacy-column-sync
-- half, which students/page.tsx, the profile page, ID cards and admission
-- print pages all still read directly).
--
-- This function is transfer_student(...,p_new_roll) with the
-- `insert into student_transfers` removed -- same authorization check, same
-- students update, nothing else. set_student_enrollment already persists the
-- transfer/promotion note on the new student_enrollments row itself, so no
-- note parameter is needed here at all: the history now lives on
-- student_enrollments exclusively, not duplicated onto a second table.
create or replace function public.sync_student_legacy_placement(
  p_student_id uuid,
  p_to_class text,
  p_to_section text,
  p_new_roll integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target students%rowtype;
  scope_changed boolean;
begin
  select * into target from students where id = p_student_id for update;
  if not found then
    raise exception 'unknown student';
  end if;
  if target.school_id is distinct from public.app_current_school_id() then
    raise exception 'student not accessible';
  end if;

  scope_changed := p_to_class is distinct from target.class_name
    or p_to_section is distinct from target.section;
  update students
  set class_name = p_to_class,
      section = p_to_section,
      roll_number = case
        when p_new_roll is not null then p_new_roll
        when scope_changed then null
        else roll_number
      end
  where id = p_student_id;
end $$;

-- Same lockdown every comparable RPC in this codebase gets (e.g. 0120's
-- transfer_student grants) -- missing this leaves Postgres' default
-- EXECUTE-to-PUBLIC grant standing, letting an anon-key caller invoke this
-- and enumerate real student ids via the distinct 'unknown student' vs
-- 'student not accessible' error messages.
revoke execute on function public.sync_student_legacy_placement(uuid, text, text, integer) from anon, public;
grant execute on function public.sync_student_legacy_placement(uuid, text, text, integer) to authenticated;

comment on function public.sync_student_legacy_placement(uuid, text, text, integer) is
  'Wave 6 (issue #591): syncs the legacy students.class_name/section/roll_number '
  'columns after a set_student_enrollment call, same authorization/reset logic '
  'transfer_student(...) always had, minus its student_transfers history-log '
  'insert -- that history now lives solely on student_enrollments.note. '
  'Replaces transfer_student() at both its call sites (transferStudent() in '
  'app/school/students/actions.ts, the Promotion action) so student_transfers '
  'can be dropped (0187).';
