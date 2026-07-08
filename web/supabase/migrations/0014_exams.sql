-- Exam entity + Closed state (issue #8). Closing is PERMANENT: no reopen path
-- exists anywhere; once closed, all edits are rejected (result viewing stays
-- read-only). Gated only by ordinary Exam-screen access (PRD §5.5).

create type public.exam_status as enum ('open', 'closed');

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  exam_year int not null,
  status public.exam_status not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index exams_school_idx on public.exams (school_id);

alter table public.exams enable row level security;

create policy "school members manage exams" on public.exams
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages exams" on public.exams
  for all using (public.app_current_role() = 'super_admin');

-- Closed exams are immutable, and status can never go closed -> open.
-- Only close_exam() (which sets closed_at with the status) may close.
create function public.enforce_exam_close() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then
      raise exception 'a Closed exam cannot be deleted';
    end if;
    return old;
  end if;
  if old.status = 'closed' then
    raise exception 'a Closed exam cannot be edited';
  end if;
  return new;
end $$;

create trigger exam_close_immutable
  before update or delete on public.exams
  for each row execute function public.enforce_exam_close();

-- Closing goes through this RPC so the confirmation lives in one place.
-- Access: any member of the exam's School (screen-level gating happens at the
-- route layer per the Staff Permission Grant model — no extra permission).
create function public.close_exam(exam uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  target exams%rowtype;
begin
  select * into target from exams where id = exam for update;
  if not found then
    raise exception 'unknown exam';
  end if;
  if target.school_id is distinct from public.app_current_school_id() then
    raise exception 'exam not accessible';
  end if;
  if target.status = 'closed' then
    raise exception 'exam already closed';
  end if;
  -- Direct update bypasses the trigger guard only in the open->closed direction.
  update exams set status = 'closed', closed_at = now() where id = exam;
end $$;

revoke execute on function public.close_exam(uuid) from anon, public;
grant execute on function public.close_exam(uuid) to authenticated;
