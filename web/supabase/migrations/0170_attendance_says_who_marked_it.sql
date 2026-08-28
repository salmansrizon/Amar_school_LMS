-- 0170_attendance_says_who_marked_it.sql
-- Map #524 / ticket #540: "Saved at 10:42 by Karim Mia".
--
-- attendance_records carries created_at and nothing about the person who marked
-- it, so the register could say when it was last touched but never by whom. In a
-- school that is the question people actually ask — a parent disputes an absence
-- and the answer has to name a teacher, not a timestamp.
--
-- Both tables get it, because a day is marked across the two: present students
-- land in attendance_records and absent ones in attendance_absence_notes, and a
-- register showing an author for half its rows is worse than one showing none.
--
-- Nullable on purpose. The RFID job (0017) and the reconciliation caller write
-- attendance_records with no user session at all, and null there is the truth:
-- the machine marked it, nobody did.
alter table public.attendance_records
  add column if not exists marked_by uuid references public.profiles (id) on delete set null,
  add column if not exists marked_at timestamptz;

alter table public.attendance_absence_notes
  add column if not exists marked_by uuid references public.profiles (id) on delete set null,
  add column if not exists marked_at timestamptz;

comment on column public.attendance_records.marked_by is
  'Who marked this manually (#540). Null means the RFID/reconciliation job wrote it, not a person.';

-- Same signature, replaced in place per project convention. The only change is
-- that both writes now record the caller and the moment; `auth.uid()` is the
-- session behind the definer, not the definer itself.
create or replace function public.save_student_attendance(p_att_date date, p_records jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  school uuid := public.app_current_school_id();
  marker uuid := auth.uid();
  n int := 0;
  rec jsonb;
  sid uuid;
begin
  if school is null then
    raise exception 'no school context';
  end if;
  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'records must be an array';
  end if;

  for rec in select * from jsonb_array_elements(p_records) loop
    sid := (rec ->> 'student_id')::uuid;
    if not exists (select 1 from students where id = sid and school_id = school) then
      raise exception 'student does not belong to this school';
    end if;

    if (rec ->> 'present')::boolean then
      insert into attendance_records (school_id, person_type, person_id, att_date, entry_at, exit_at, status, marked_by, marked_at)
      values (school, 'student', sid, p_att_date, now(), null, 'present', marker, now())
      on conflict (person_type, person_id, att_date) do update
        set entry_at = excluded.entry_at, exit_at = null, status = 'present',
            marked_by = excluded.marked_by, marked_at = excluded.marked_at;
      delete from attendance_absence_notes
        where person_type = 'student' and person_id = sid and att_date = p_att_date;
    else
      delete from attendance_records
        where person_type = 'student' and person_id = sid and att_date = p_att_date;
      insert into attendance_absence_notes (school_id, person_type, person_id, att_date, cause, marked_by, marked_at)
      values (school, 'student', sid, p_att_date, nullif(rec ->> 'cause', ''), marker, now())
      on conflict (person_type, person_id, att_date) do update
        set cause = excluded.cause, marked_by = excluded.marked_by, marked_at = excluded.marked_at;
    end if;
    n := n + 1;
  end loop;

  return n;
end $$;
