-- Public, unauthenticated student ID-card verification (issues #140/#141/#144).
--
-- The printed card carries a QR that anyone can scan to check the card is
-- genuine. It links to /verify/<token>, where <token> is an opaque random
-- string (a hyphen-stripped UUIDv4, ~122 bits of entropy) — NOT the internal
-- student id — so it leaks nothing and can't be enumerated. Validity is derived live from archived_at: the moment a
-- student is archived (transferred out / graduated / left), every printed card
-- flips to INVALID on the next scan. There is no stored "valid" flag to go
-- stale, so the card's scope ends exactly when the enrollment does (#140).

-- 1. Opaque per-student token. A volatile default backfills existing rows with
--    distinct values (per-row evaluation on the table rewrite), and unique
--    guarantees no collision.
alter table public.students
  add column public_token text not null unique
    default replace(gen_random_uuid()::text, '-', '');

-- 2. Anon-safe lookup. students RLS blocks anon SELECT, so the public page
--    resolves a token via this security-definer function, which returns only
--    the fields safe to show on a public card — never guardian/student mobile,
--    NID, address or DOB. A missing token yields no rows (the page shows
--    "not found"); an archived student yields is_valid = false and no photo.
create function public.student_by_public_token(token text)
  returns table (
    full_name text,
    class_name text,
    section text,
    roll_number int,
    photo_path text,
    is_valid boolean,
    school_name text,
    school_logo_path text
  )
language sql stable security definer set search_path = public as $$
  select
    s.full_name,
    s.class_name,
    s.section,
    s.roll_number,
    case when s.archived_at is null then s.photo_path end as photo_path,
    (s.archived_at is null) as is_valid,
    sc.name as school_name,
    sc.logo_path as school_logo_path
  from students s
  join schools sc on sc.id = s.school_id
  where s.public_token = token
$$;

grant execute on function public.student_by_public_token(text) to anon, authenticated;

-- 3. The public page needs the photo of a VALID card. student-photos is a
--    private bucket, so grant anon a narrow SELECT: only objects that are the
--    photo of a non-archived student. Paths are unguessable (school_id/uuid)
--    and only discoverable through a valid token, and the photo is already
--    printed on the physical card — so exposing it for valid cards is the
--    intended model. Archived students' photos stay unreadable to anon.
create policy "anon reads valid student card photo" on storage.objects
  for select to anon
  using (
    bucket_id = 'student-photos'
    and exists (
      select 1 from public.students s
      where s.photo_path = name and s.archived_at is null
    )
  );
