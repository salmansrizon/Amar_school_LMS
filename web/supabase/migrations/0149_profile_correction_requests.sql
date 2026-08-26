-- 0149_profile_correction_requests.sql
-- Map #434 / ticket #456: a Student asks for a correction; the Owner applies it.
--
-- CONTEXT.md: "A Student never edits a school record." `students` is the
-- school's record of enrolment, and this does not change that — every column
-- stays read-only to role='student', enforced in RLS rather than by which
-- inputs a form renders. A disabled field is not a permission.

-- ---------------------------------------------------------------------------
-- Mechanism: a structured table, not a student_messages row.
--
-- The ticket asked for this to be weighed rather than defaulted. The message
-- channel already exists and would have cost nothing to reuse — but a message
-- is prose, and applying it means an Owner reading a paragraph and retyping the
-- value, which is exactly what the ticket says to avoid. Field + current value
-- + requested value is what makes one-click apply possible, and what gives the
-- audit trail a real before/after instead of a sentence.
create table if not exists public.student_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,

  -- The whitelist lives in a CHECK, not in the form. roll_number, student_no,
  -- class_name, section and date_of_birth belong to admission and transfer —
  -- correcting those is a different act with different consequences (a roll is
  -- rewritten at promotion; a Student Number is half a login). full_name and
  -- guardian_nid are identity documents, not contact details.
  field text not null check (field in (
    'student_mobile', 'blood_group', 'religion',
    'village', 'union_name', 'upazila', 'district',
    'guardian_name', 'guardian_relation', 'guardian_mobile',
    'photo_path'
  )),
  current_value text,
  requested_value text not null,
  note text,

  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  reject_reason text,

  created_at timestamptz not null default now()
);

create index if not exists profile_change_requests_queue_idx
  on public.student_profile_change_requests (school_id, status, created_at desc);

alter table public.student_profile_change_requests enable row level security;

-- Same-school tenancy, as every cross-table reference here carries.
create or replace function public.enforce_change_request_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from students where id = new.student_id;
  if v_school is null or v_school <> new.school_id then
    raise exception 'student does not belong to this school';
  end if;
  return new;
end $$;

drop trigger if exists change_request_refs on public.student_profile_change_requests;
create trigger change_request_refs
  before insert or update on public.student_profile_change_requests
  for each row execute function public.enforce_change_request_refs();

-- ---------------------------------------------------------------------------
-- A Student raises and reads their own. No update, no delete: a request under
-- review is not theirs to edit, and the resolution columns live on the same row.
drop policy if exists "student reads own change requests" on public.student_profile_change_requests;
create policy "student reads own change requests" on public.student_profile_change_requests
  for select using (student_id = public.app_current_student_id());

drop policy if exists "student raises own change request" on public.student_profile_change_requests;
create policy "student raises own change request" on public.student_profile_change_requests
  for insert with check (
    student_id = public.app_current_student_id()
    and school_id = public.app_current_student_school_id()
    and status = 'pending'
    and resolved_by is null
  );

-- The Owner resolves. Staff read the queue; only an owner may apply, because
-- applying writes the school's own record of enrolment.
drop policy if exists "school members read change requests" on public.student_profile_change_requests;
create policy "school members read change requests" on public.student_profile_change_requests
  for select using (school_id = public.app_current_school_id());

drop policy if exists "owner resolves change requests" on public.student_profile_change_requests;
create policy "owner resolves change requests" on public.student_profile_change_requests
  for update using (
    school_id = public.app_current_school_id()
    and public.app_current_role() = 'school_owner'
  ) with check (school_id = public.app_current_school_id());

drop policy if exists "super admin manages change requests" on public.student_profile_change_requests;
create policy "super admin manages change requests" on public.student_profile_change_requests
  for all using (public.app_current_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- Applying, in one transaction.
--
-- The write to `students` and the resolution of the request must not be able to
-- come apart — a request marked applied whose value never landed is worse than
-- either failure alone. The whitelist is re-checked here rather than trusted
-- from the row, because this function is what actually holds the pen.
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

  if r.field not in ('student_mobile','blood_group','religion','village','union_name',
                     'upazila','district','guardian_name','guardian_relation',
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

revoke execute on function public.apply_profile_change_request(uuid) from anon;
grant execute on function public.apply_profile_change_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A requested photo is an upload held pending, never a live change.
--
-- photo_path feeds the printed ID card, so the object lands in the student's own
-- pending folder and only becomes the live path when the Owner applies the
-- request. Same bucket, so applying is a pointer change with nothing to copy and
-- no orphan to sweep.
drop policy if exists "student writes own pending photo" on storage.objects;
create policy "student writes own pending photo" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.app_current_student_school_id()::text
    and (storage.foldername(name))[2] = 'pending'
    and (storage.foldername(name))[3] = public.app_current_student_id()::text
  );

drop policy if exists "student reads own photo objects" on storage.objects;
create policy "student reads own photo objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.app_current_student_school_id()::text
  );
