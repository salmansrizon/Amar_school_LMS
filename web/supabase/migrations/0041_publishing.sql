-- Publishing (issue #37, PRD §5.8): notices, homework, lesson plans, daily
-- lessons and exam-prep suggestions share one table (kind discriminates) and
-- one list/detail UI pattern. Photo albums are a separate table pair with
-- server-enforced, per-album-configurable image-count and per-image-size
-- caps (Supabase Storage, following the private-bucket + folder-per-school
-- RLS + client-direct-upload pattern issue #45 established for syllabus PDFs).
-- Additive only (staging and main share this database).

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  kind text not null check (kind in ('notice', 'homework', 'lesson_plan', 'daily_lesson', 'exam_prep')),
  title text not null,
  content text,
  importance text not null default 'normal' check (importance in ('normal', 'important', 'urgent')),
  target_type text not null default 'all' check (target_type in ('all', 'specific')),
  target_class_name text,
  target_shift_id uuid references public.shifts (id) on delete set null,
  target_section text,
  image_path text,
  link_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint publications_target_all_is_clean check (
    target_type = 'specific'
    or (target_class_name is null and target_shift_id is null and target_section is null)
  )
);
create index publications_school_kind_idx on public.publications (school_id, kind, created_at desc);

alter table public.publications enable row level security;
create policy "school members manage publications" on public.publications
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages publications" on public.publications
  for all using (public.app_current_role() = 'super_admin');

-- A specific target_shift_id must belong to the row's own School (same shape
-- as enforce_class_ref_school / enforce_student_subject_school — a foreign
-- shift UUID from another School could otherwise slip past RLS since the
-- row's own school_id column is still correct).
create function public.enforce_publication_shift_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.target_shift_id is not null and not exists (
    select 1 from shifts where id = new.target_shift_id and school_id = new.school_id
  ) then
    raise exception 'shift does not belong to this school';
  end if;
  return new;
end $$;

create trigger publication_shift_same_school
  before insert or update on public.publications
  for each row execute function public.enforce_publication_shift_school();

-- Gallery albums: per-album configurable image-count and per-image-size caps
-- (PRD §5.8, §7 "preserve as configurable limits, not hardcoded"; the PRD's
-- example values — 20 images / 1MB each — are the defaults here).
create table public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  title text not null,
  max_images int not null default 20 check (max_images > 0),
  max_image_size_bytes int not null default 1048576 check (max_image_size_bytes > 0),
  created_at timestamptz not null default now()
);
create index gallery_albums_school_idx on public.gallery_albums (school_id);

alter table public.gallery_albums enable row level security;
create policy "school members manage gallery_albums" on public.gallery_albums
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages gallery_albums" on public.gallery_albums
  for all using (public.app_current_role() = 'super_admin');

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  storage_path text not null,
  file_name text not null,
  file_size bigint not null check (file_size > 0),
  created_at timestamptz not null default now()
);
create index gallery_photos_album_idx on public.gallery_photos (album_id);

alter table public.gallery_photos enable row level security;
create policy "school members manage gallery_photos" on public.gallery_photos
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages gallery_photos" on public.gallery_photos
  for all using (public.app_current_role() = 'super_admin');

-- Server-enforced caps (not just the upload UI, per issue #37's explicit
-- requirement). A row-locking trigger closes the race a plain app-layer count
-- check would leave open between two concurrent uploads (same shape as the
-- roll-number race guard from issue #27/#34). Also re-verifies album/photo
-- tenancy (mirrors enforce_class_ref_school) since album_id is client-supplied.
create function public.enforce_gallery_photo_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  album_school_id uuid;
  album_max_images int;
  album_max_size bigint;
  existing_count int;
begin
  select school_id, max_images, max_image_size_bytes
    into album_school_id, album_max_images, album_max_size
    from gallery_albums where id = new.album_id for update;
  if not found or album_school_id <> new.school_id then
    raise exception 'album does not belong to this school';
  end if;
  if new.file_size > album_max_size then
    raise exception 'photo exceeds this album''s per-image size limit';
  end if;
  select count(*) into existing_count from gallery_photos where album_id = new.album_id;
  if existing_count >= album_max_images then
    raise exception 'album has reached its image limit';
  end if;
  return new;
end $$;

create trigger gallery_photo_cap
  before insert on public.gallery_photos
  for each row execute function public.enforce_gallery_photo_cap();

-- Gallery Storage bucket (private, images only). The bucket-level
-- file_size_limit is a generous hard ceiling; the real, configurable
-- per-album cap is enforced above by the trigger against each album's own
-- max_image_size_bytes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "school members read own gallery objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'gallery' and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members write own gallery objects" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'gallery' and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members update own gallery objects" on storage.objects
  for update to authenticated using (
    bucket_id = 'gallery' and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members delete own gallery objects" on storage.objects
  for delete to authenticated using (
    bucket_id = 'gallery' and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "super admin manages gallery objects" on storage.objects
  for all to authenticated using (
    bucket_id = 'gallery' and public.app_current_role() = 'super_admin'
  );

-- Publication images (notice/homework/etc — a single optional image, no album
-- cap concept, just a per-image size ceiling matching student-photos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publications', 'publications', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "school members read own publication objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'publications' and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members write own publication objects" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'publications' and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members update own publication objects" on storage.objects
  for update to authenticated using (
    bucket_id = 'publications' and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members delete own publication objects" on storage.objects
  for delete to authenticated using (
    bucket_id = 'publications' and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "super admin manages publication objects" on storage.objects
  for all to authenticated using (
    bucket_id = 'publications' and public.app_current_role() = 'super_admin'
  );
