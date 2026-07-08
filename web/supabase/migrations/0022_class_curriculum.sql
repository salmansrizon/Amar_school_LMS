-- Class & Curriculum I (issue #26, PRD §5.4, first half): classes, rooms, and
-- the subject catalogue with Theory/MCQ/Practical mark config + multi-paper.
-- Additive only (staging and main share this database). Subject-to-class/student
-- assignment (compulsory/optional) is deliberately out of scope here — that is
-- §5.1 / issue #46.

-- Classes: a section within an education level, optionally a group/department
-- (e.g. Science/Commerce for higher classes).
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  section text,
  education_level text,
  group_department text,
  created_at timestamptz not null default now()
);
create index classes_school_idx on public.classes (school_id);

alter table public.classes enable row level security;
create policy "school members manage classes" on public.classes
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages classes" on public.classes
  for all using (public.app_current_role() = 'super_admin');

-- Rooms: capacity feeds the Exam Seat Plan (§5.5). Capacity must be positive.
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  capacity int not null check (capacity > 0),
  created_at timestamptz not null default now()
);
create index rooms_school_idx on public.rooms (school_id);

alter table public.rooms enable row level security;
create policy "school members manage rooms" on public.rooms
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages rooms" on public.rooms
  for all using (public.app_current_role() = 'super_admin');

-- Subjects: the School's subject catalogue with per-component mark configuration
-- (Theory/MCQ/Practical) and multi-paper support (e.g. Bangla 1st/2nd paper).
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  code text,
  theory_marks int not null default 0 check (theory_marks >= 0),
  mcq_marks int not null default 0 check (mcq_marks >= 0),
  practical_marks int not null default 0 check (practical_marks >= 0),
  paper_count int not null default 1 check (paper_count between 1 and 4),
  created_at timestamptz not null default now(),
  -- A subject must carry marks in at least one component to be meaningful.
  constraint subjects_marks_nonzero
    check (theory_marks + mcq_marks + practical_marks > 0)
);
create index subjects_school_idx on public.subjects (school_id);

alter table public.subjects enable row level security;
create policy "school members manage subjects" on public.subjects
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages subjects" on public.subjects
  for all using (public.app_current_role() = 'super_admin');
