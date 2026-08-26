-- 0140_student_tasks.sql
-- Map #434 / ticket #446: homework tasks, with the student's own tick-off.

-- ---------------------------------------------------------------------------
-- 1. A due date, on every kind.
--
-- The ticket asks whether due_at belongs to homework only or to every
-- publication. Every kind: a notice about a form to return by Thursday has a
-- deadline too, and a nullable column costs nothing on the kinds that ignore
-- it. Restricting it to homework would mean a CHECK constraint whose only
-- effect is to stop someone using a field they wanted.
alter table public.publications add column if not exists due_at timestamptz;

create index if not exists publications_due_idx
  on public.publications (school_id, due_at) where due_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Completion — the student's own claim.
--
-- Deliberately NOT student_publication_reads (0139). Opening a page is a UI
-- receipt; ticking off homework is a statement a Student makes about their own
-- work, which a teacher then sees attributed to them. Same student, same
-- publication, different meanings, so different tables — and this one is
-- reversible where a read receipt is not.
create table if not exists public.student_task_completions (
  publication_id uuid not null references public.publications (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (publication_id, student_id)
);

alter table public.student_task_completions enable row level security;

-- The Student owns their own claim, including taking it back — a tick made by
-- mistake must be undoable, unlike a read receipt.
drop policy if exists "student manages own task completion" on public.student_task_completions;
create policy "student manages own task completion" on public.student_task_completions
  for all using (student_id = public.app_current_student_id())
  with check (student_id = public.app_current_student_id());

-- School staff see the whole roster for their own school's tasks — that is the
-- teacher's view of who has ticked off. Read only: a teacher must never be able
-- to tick a task off on a Student's behalf, because the row's entire meaning is
-- that the Student said so.
drop policy if exists "school members read task completions" on public.student_task_completions;
create policy "school members read task completions" on public.student_task_completions
  for select using (
    exists (
      select 1 from public.publications p
       where p.id = publication_id
         and p.school_id = public.app_current_school_id()
    )
  );

drop policy if exists "super admin manages task completions" on public.student_task_completions;
create policy "super admin manages task completions" on public.student_task_completions
  for all using (public.app_current_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- 3. The teacher's roster.
--
-- A teacher needs student names against those completions, and `students` is
-- readable by school members — but the roster also has to show the students who
-- have NOT ticked, which is a left join the client would otherwise assemble by
-- reading the whole class. One view, one query, and it stays inside the
-- school's own rows.
drop view if exists public.task_completion_roster;
create view public.task_completion_roster with (security_invoker = on) as
  select p.id as publication_id,
         s.id as student_id,
         s.full_name,
         s.roll_number,
         s.class_name,
         s.section,
         c.completed_at
    from public.publications p
    join public.students s
      on s.school_id = p.school_id
     and s.archived_at is null
     and (p.target_type = 'all'
          or ((p.target_class_name is null or s.class_name = p.target_class_name)
          and (p.target_section is null or coalesce(s.section, '') = p.target_section)))
    left join public.student_task_completions c
      on c.publication_id = p.id and c.student_id = s.id;

grant select on public.task_completion_roster to authenticated;
