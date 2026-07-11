-- Exams III (issue #32, PRD §5.5): marks entry. Builds on the exam entity/
-- Closed-state immutability (issue #8) and the exam-setup subject/roster
-- wiring (issue #47) — extends the same same-school + Closed-exam guard
-- pattern the #47 child tables (exam_subject_teachers/exam_routine_entries/
-- exam_seat_plans) already use, rather than reinventing it. Additive only
-- (staging and main share this database).

-- One row per (exam, student, subject); the three components mirror the
-- subjects table's Theory/MCQ/Practical split (exam-setup.html /
-- marks-entry.html show all three as separate inputs) so a subject's full
-- marks stay derivable from `subjects` without duplicating them here, and
-- the total is always the live sum of what was actually entered.
create table public.exam_marks (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  theory_obtained numeric(6, 2) not null default 0 check (theory_obtained >= 0),
  mcq_obtained numeric(6, 2) not null default 0 check (mcq_obtained >= 0),
  practical_obtained numeric(6, 2) not null default 0 check (practical_obtained >= 0),
  obtained_marks numeric(7, 2) generated always as
    (theory_obtained + mcq_obtained + practical_obtained) stored,
  entered_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exam_id, student_id, subject_id)
);
create index exam_marks_exam_idx on public.exam_marks (exam_id);
create index exam_marks_student_idx on public.exam_marks (student_id);

alter table public.exam_marks enable row level security;
create policy "school members manage exam_marks" on public.exam_marks
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages exam_marks" on public.exam_marks
  for all using (public.app_current_role() = 'super_admin');

-- Same-school tenancy for exam/student/subject/entered_by, plus the Closed-
-- exam immutability rule (exam_is_open, migration 0037) — mirrors
-- enforce_exam_subject_teacher_school exactly.
create function public.enforce_exam_mark_school() returns trigger
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
  if not exists (select 1 from subjects where id = new.subject_id and school_id = new.school_id) then
    raise exception 'subject does not belong to this school';
  end if;
  if new.entered_by is not null and not exists (
    select 1 from employees where id = new.entered_by and school_id = new.school_id
  ) then
    raise exception 'entering teacher does not belong to this school';
  end if;
  return new;
end $$;

create trigger exam_mark_same_school
  before insert or update on public.exam_marks
  for each row execute function public.enforce_exam_mark_school();

-- Reuses the existing generic delete-guard function (migration 0037) — it
-- only reads old.exam_id, so no per-table duplicate is needed.
create trigger exam_mark_delete_guard
  before delete on public.exam_marks
  for each row execute function public.enforce_exam_child_open_on_delete();

-- Promotion/roll-transfer (issue #32) reuses issue #27's transfer_student RPC
-- rather than a new one: adds an optional explicit new-roll number so the
-- Promotion & Roll Transfer screen can assign a roll in the destination class
-- directly (promotion-transfer.html's editable "New Roll" column), instead of
-- relying on the existing "roll reset to null on class change, fix up later"
-- behavior. Backward compatible — a caller that omits p_new_roll (every
-- existing call site) keeps today's exact behavior.
create or replace function public.transfer_student(
  p_student_id uuid,
  p_to_class text,
  p_to_section text,
  p_to_shift_id uuid,
  p_note text,
  p_new_roll int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target students%rowtype;
  class_changed boolean;
  resolved_shift_id uuid;
begin
  select * into target from students where id = p_student_id for update;
  if not found then
    raise exception 'unknown student';
  end if;
  if target.school_id is distinct from public.app_current_school_id() then
    raise exception 'student not accessible';
  end if;

  resolved_shift_id := coalesce(p_to_shift_id, target.shift_id);

  insert into student_transfers (
    student_id, from_class, from_section, from_shift_id,
    to_class, to_section, to_shift_id, note
  ) values (
    p_student_id, target.class_name, target.section, target.shift_id,
    p_to_class, p_to_section, resolved_shift_id, p_note
  );

  class_changed := p_to_class is distinct from target.class_name;
  update students
  set class_name = p_to_class,
      section = p_to_section,
      shift_id = resolved_shift_id,
      roll_number = case
        when p_new_roll is not null then p_new_roll
        when class_changed then null
        else roll_number
      end
  where id = p_student_id;
end $$;
