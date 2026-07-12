-- Exams IV (issue #33, PRD §5.5): co-curricular checklist backing the
-- progress report's "Co-curricular Checklist" section. No existing data
-- model covers this — behaviour_log_entries (issue #7/#46) is a free-text
-- incident/rating log, not a per-activity checklist, so this is additive:
-- a school-defined activity list (cocurricular_items) checked per student
-- per exam (cocurricular_checklist_marks), mirroring exam_marks' (migration
-- 0048) same-school-tenancy + Closed-exam-immutability pattern rather than
-- inventing a new guard shape. Additive only (staging and main share this
-- database).

create table public.cocurricular_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index cocurricular_items_school_idx on public.cocurricular_items (school_id);

alter table public.cocurricular_items enable row level security;
create policy "school members manage cocurricular_items" on public.cocurricular_items
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages cocurricular_items" on public.cocurricular_items
  for all using (public.app_current_role() = 'super_admin');

-- One row per (exam, student, item) — no row (or a false row, read the same
-- by the UI) means unchecked. Ties to a specific exam so a student's
-- checklist can vary term to term, matching exam_marks' per-exam grain.
create table public.cocurricular_checklist_marks (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  student_id uuid not null references public.students (id) on delete cascade,
  item_id uuid not null references public.cocurricular_items (id) on delete cascade,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (exam_id, student_id, item_id)
);
create index cocurricular_checklist_marks_exam_idx on public.cocurricular_checklist_marks (exam_id);
create index cocurricular_checklist_marks_student_idx on public.cocurricular_checklist_marks (student_id);

alter table public.cocurricular_checklist_marks enable row level security;
create policy "school members manage cocurricular_checklist_marks" on public.cocurricular_checklist_marks
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages cocurricular_checklist_marks" on public.cocurricular_checklist_marks
  for all using (public.app_current_role() = 'super_admin');

-- Same-school tenancy for exam/student/item, plus the Closed-exam
-- immutability rule (exam_is_open, migration 0044) — mirrors
-- enforce_exam_mark_school (migration 0048) exactly.
create function public.enforce_cocurricular_mark_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() <> 'super_admin' and not public.exam_is_open(new.exam_id) then
    raise exception 'exam is closed';
  end if;
  if not exists (select 1 from exams where id = new.exam_id and school_id = new.school_id) then
    raise exception 'exam does not belong to this school';
  end if;
  if not exists (select 1 from students where id = new.student_id and school_id = new.school_id) then
    raise exception 'student does not belong to this school';
  end if;
  if not exists (select 1 from cocurricular_items where id = new.item_id and school_id = new.school_id) then
    raise exception 'checklist item does not belong to this school';
  end if;
  return new;
end $$;

create trigger cocurricular_mark_same_school
  before insert or update on public.cocurricular_checklist_marks
  for each row execute function public.enforce_cocurricular_mark_school();

-- Reuses the existing generic delete-guard function (migration 0044) — it
-- only reads old.exam_id, so no per-table duplicate is needed.
create trigger cocurricular_mark_delete_guard
  before delete on public.cocurricular_checklist_marks
  for each row execute function public.enforce_exam_child_open_on_delete();
