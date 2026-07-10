-- Students I (issue #27, PRD §5.1 first half): deepen the MVP student slice with
-- the full admission profile, soft-archive, class/shift transfer + history, a
-- photo bucket, and auto-roll numbering. Additive only.
-- (Applied remotely 2026-07-09 as 20260709061901; mirrored to the repo later —
-- hence the local number sorting after 0028/0029.)

alter table public.students
  add column roll_number int,
  add column gender text,
  add column date_of_birth date,
  add column blood_group text,
  add column religion text,
  add column student_mobile text,
  add column village text,
  add column union_name text,
  add column upazila text,
  add column district text,
  add column guardian_name text,
  add column guardian_relation text,
  add column guardian_mobile text,
  add column guardian_nid text,
  add column is_freedom_fighter_child boolean not null default false,
  add column is_indigenous boolean not null default false,
  add column previous_institute text,
  add column previous_class text,
  add column sibling_info text,
  add column photo_path text,
  add column shift_id uuid references public.shifts (id) on delete set null,
  add column archived_at timestamptz;

create index students_archived_idx on public.students (school_id, archived_at);

-- Auto-roll numbering: when admitting into a class without an explicit roll,
-- assign the next number within that School+class. security definer so the max()
-- is computed over the whole School regardless of the caller's row visibility.
create function public.assign_student_roll() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.roll_number is null and new.class_name is not null then
    select coalesce(max(roll_number), 0) + 1 into new.roll_number
    from students
    where school_id = new.school_id and class_name = new.class_name;
  end if;
  return new;
end $$;

create trigger student_assign_roll
  before insert on public.students
  for each row execute function public.assign_student_roll();

-- Class/shift transfer history (one row per transfer).
create table public.student_transfers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  student_id uuid not null references public.students (id) on delete cascade,
  from_class text,
  from_section text,
  from_shift_id uuid references public.shifts (id) on delete set null,
  to_class text,
  to_section text,
  to_shift_id uuid references public.shifts (id) on delete set null,
  note text,
  transferred_at timestamptz not null default now()
);
create index student_transfers_student_idx on public.student_transfers (student_id);

alter table public.student_transfers enable row level security;
create policy "school members manage student_transfers" on public.student_transfers
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages student_transfers" on public.student_transfers
  for all using (public.app_current_role() = 'super_admin');

-- Student photo bucket (private, images only, 2 MB cap).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "school members read own student photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members write own student photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members update own student photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members delete own student photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "super admin manages student photos" on storage.objects
  for all to authenticated using (
    bucket_id = 'student-photos' and public.app_current_role() = 'super_admin'
  );
