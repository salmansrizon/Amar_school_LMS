-- Issue #622: the admission form's Address section forced Village/Union/
-- Upazila/District into four separate inputs. Real addresses don't always
-- split cleanly along that hierarchy, so it becomes one free-text line.
--
-- No backfill: existing students' 4-part address data is dropped along with
-- the columns, not concatenated into the new field. New field starts blank
-- for existing students; re-entered on next profile edit.

-- student_self (0131) selects the 4 columns by name, so it must go before
-- they can be dropped — Postgres refuses otherwise (dependent view).
drop view if exists public.student_self;

alter table public.students
  drop column if exists village,
  drop column if exists union_name,
  drop column if exists upazila,
  drop column if exists district,
  add column if not exists address text;

-- ---------------------------------------------------------------------------
-- Recreate student_self with the same security posture 0133/0150 hardened it
-- with — drop+create resets both.
create view public.student_self with (security_invoker = off) as
  select id, school_id, student_no, full_name, roll_number, class_name, section,
         gender, date_of_birth, blood_group, religion, student_mobile,
         address,
         guardian_name, guardian_relation, guardian_mobile, guardian_phone,
         photo_path, created_at
    from public.students
   where profile_id = auth.uid() and archived_at is null;

grant select on public.student_self to authenticated;
alter view public.student_self set (security_barrier = true);

-- ---------------------------------------------------------------------------
-- Profile Correction Request whitelist (0149): 4 independently-correctable
-- address fields collapse to the 1 the Student now actually sees.
alter table public.student_profile_change_requests
  drop constraint if exists student_profile_change_requests_field_check;
alter table public.student_profile_change_requests
  add constraint student_profile_change_requests_field_check check (field in (
    'student_mobile', 'blood_group', 'religion',
    'address',
    'guardian_name', 'guardian_relation', 'guardian_mobile',
    'photo_path'
  ));

create or replace function public.apply_profile_change_request(p_request uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.student_profile_change_requests;
begin
  if public.app_current_role() <> 'school_owner' then
    raise exception 'only a School Owner can apply a correction';
  end if;

  select * into r from public.student_profile_change_requests
   where id = p_request for update;
  if not found or r.school_id is distinct from public.app_current_school_id() then
    raise exception 'request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'this request has already been resolved';
  end if;

  if r.field not in ('student_mobile','blood_group','religion','address',
                     'guardian_name','guardian_relation',
                     'guardian_mobile','photo_path') then
    raise exception 'field % is not correctable this way', r.field;
  end if;

  execute format('update public.students set %I = $1 where id = $2', r.field)
    using r.requested_value, r.student_id;

  -- guardian_phone shadows guardian_mobile for the absence-SMS rules (#31);
  -- correcting one without the other would silently keep texting the old number.
  if r.field = 'guardian_mobile' then
    update public.students set guardian_phone = r.requested_value where id = r.student_id;
  end if;

  update public.student_profile_change_requests
     set status = 'applied', resolved_by = auth.uid(), resolved_at = now()
   where id = p_request;

  perform public.record_audit('student_profile_change', p_request::text, 'update',
    r.school_id, null,
    jsonb_build_object('field', r.field, 'value', r.current_value),
    jsonb_build_object('field', r.field, 'value', r.requested_value,
                       'requested_by_student', r.student_id),
    null, null, null, null);
end $$;
