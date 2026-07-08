-- Greploop hardening for issue #8:
-- 1. updated_at audit column (renames were untracked).
-- 2. Super Admin exemption in the close trigger — without it a Closed exam
--    blocked even vendor-side school-deletion cascades. School-side behavior
--    is unchanged: no reopen path, no edits, no deletes.

alter table public.exams add column updated_at timestamptz not null default now();

create function public.touch_exam() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger exam_touch
  before update on public.exams
  for each row execute function public.touch_exam();

create or replace function public.enforce_exam_close() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() = 'super_admin' then
    return coalesce(new, old);
  end if;
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

alter table public.exams add constraint exam_year_range check (exam_year between 2000 and 2100);
