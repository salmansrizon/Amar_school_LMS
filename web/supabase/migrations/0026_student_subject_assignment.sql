-- Students II (issue #46, PRD §5.1 second half): compulsory/optional subject
-- assignment per student (bulk "assign all in a class" builds on this).
-- Additive only.

create table public.student_subjects (
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (student_id, subject_id)
);
create index student_subjects_school_idx on public.student_subjects (school_id);
create index student_subjects_subject_idx on public.student_subjects (subject_id);

alter table public.student_subjects enable row level security;
create policy "school members manage student_subjects" on public.student_subjects
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages student_subjects" on public.student_subjects
  for all using (public.app_current_role() = 'super_admin');

-- Both the student and the subject must belong to the row's School. security
-- definer so it can verify tenancy past RLS.
create function public.enforce_student_subject_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from students where id = new.student_id and school_id = new.school_id) then
    raise exception 'student does not belong to this school';
  end if;
  if not exists (select 1 from subjects where id = new.subject_id and school_id = new.school_id) then
    raise exception 'subject does not belong to this school';
  end if;
  return new;
end $$;

create trigger student_subject_same_school
  before insert or update on public.student_subjects
  for each row execute function public.enforce_student_subject_school();
