-- 0211_machine_enroll_infos.sql — EXPAND phase of the machine-identity redesign.
--
-- Before this migration a person's attendance-machine identity was spread over
-- three places: a prefixed `unique_id` (stu########/emp########, 0173) that
-- encoded the person's type in the string, a `rfid_card_number` column on both
-- students and employees (0173/#565, entered on the profile forms, read by
-- nothing), and the legacy `rfid_cards` table (0017) that the attendance
-- pipeline actually resolved taps through. This migration makes one table,
-- `machine_enroll_infos`, the single source of "who is enrolled on an
-- attendance machine, as which kind of person, with which card" — the input a
-- future ZKTeco sync will read. No machine communication is added here.
--
-- Two-phase because staging and main share one database: the previously
-- deployed staging code still writes students/employees.rfid_card_number
-- (admission, employee create/edit). Everything here is safe against that
-- code. 0212 (CONTRACT) re-copies anything written in the meantime and then
-- drops the legacy columns and table.

-- ---------------------------------------------------------------------------
-- 1. unique_id becomes numeric-only, drawn from ONE sequence shared by
--    students and employees.
--
-- A ZKTeco User ID must be numeric, so the stu/emp prefix has to go — and with
-- it the only thing that kept a student's id apart from an employee's: the two
-- 0173 sequences both started at 1, so stripping the prefixes would turn
-- stu00000001 and emp00000001 into the same machine id. Every existing id is
-- therefore renumbered (decision recorded on the ticket): students first, then
-- employees, each group in its existing unique_id order, from 1 upward. Only
-- the machine id changes — every row keeps its uuid `id`, which is what every
-- relationship references, and no machine has ever been loaded with the old
-- ids (no sync exists), so nothing outside this database knew them.
--
-- Global uniqueness across BOTH tables is guaranteed by the shared sequence
-- plus the insert trigger refusing caller-supplied ids (section 3): no single
-- unique index can span two tables. Each table also keeps its own global
-- unique index as a backstop.

create sequence if not exists public.machine_unique_id_seq;

-- The immutability triggers would reject the renumbering; they are recreated
-- unchanged in section 4.
drop trigger if exists student_unique_id_immutable on public.students;
drop trigger if exists employee_unique_id_immutable on public.employees;

alter table public.students drop constraint if exists students_unique_id_format;
alter table public.employees drop constraint if exists employees_unique_id_format;

-- New values are digits-only and every old value starts with stu/emp, so the
-- per-table unique indexes can never see a transient clash mid-update.
with numbered as (
  select id, row_number() over (order by unique_id, id) as n
    from public.students
)
update public.students s set unique_id = numbered.n::text
  from numbered where numbered.id = s.id;

with numbered as (
  select id,
         (select count(*) from public.students)
           + row_number() over (order by unique_id, id) as n
    from public.employees
)
update public.employees e set unique_id = numbered.n::text
  from numbered where numbered.id = e.id;

alter table public.students alter column unique_id type bigint using unique_id::bigint;
alter table public.employees alter column unique_id type bigint using unique_id::bigint;

-- Continue after the highest id handed out above (or start at 1 when both
-- tables are empty).
select case
  when m is null then setval('public.machine_unique_id_seq', 1, false)
  else setval('public.machine_unique_id_seq', m, true)
end
from (select greatest((select max(unique_id) from public.students),
                      (select max(unique_id) from public.employees)) as m) x;

-- Same 8-digit budget 0173 set, now as a numeric range instead of a pattern.
alter table public.students add constraint students_unique_id_format
  check (unique_id between 1 and 99999999);
alter table public.employees add constraint employees_unique_id_format
  check (unique_id between 1 and 99999999);

-- ---------------------------------------------------------------------------
-- 2. One id-minting function replaces 0173's prefix-taking one.
drop function if exists public.next_person_unique_id(text, regclass);

create or replace function public.next_machine_unique_id() returns bigint
language plpgsql as $$
declare n bigint;
begin
  n := nextval('public.machine_unique_id_seq');
  if n > 99999999 then
    raise exception 'machine_unique_id_seq is out of its 8-digit unique_id budget — widen students_unique_id_format / employees_unique_id_format before assigning more';
  end if;
  return n;
end $$;

revoke execute on function public.next_machine_unique_id() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Auto-assign at insert, always from the shared sequence. Unlike 0173 a
--    caller-supplied id is refused rather than accepted: an explicit value is
--    the one way two tables could end up sharing a machine id, since no index
--    spans both. Nothing in the app ever submits one.
create or replace function public.assign_student_unique_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unique_id is not null then
    raise exception 'unique_id is assigned automatically';
  end if;
  new.unique_id := public.next_machine_unique_id();
  return new;
end $$;

create or replace function public.assign_employee_unique_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unique_id is not null then
    raise exception 'unique_id is assigned automatically';
  end if;
  new.unique_id := public.next_machine_unique_id();
  return new;
end $$;

-- 0173's per-type sequences have no remaining user.
drop sequence if exists public.student_unique_id_seq;
drop sequence if exists public.employee_unique_id_seq;

-- ---------------------------------------------------------------------------
-- 4. Immutable after insert — unchanged from 0173, re-attached.
create trigger student_unique_id_immutable
  before update of unique_id on public.students
  for each row execute function public.enforce_student_unique_id_immutable();

create trigger employee_unique_id_immutable
  before update of unique_id on public.employees
  for each row execute function public.enforce_employee_unique_id_immutable();

-- ---------------------------------------------------------------------------
-- 5. machine_enroll_infos
--
-- One row per person enrolled on an attendance machine. `type` says which kind
-- of person the machine id belongs to — the thing the stu/emp prefix used to
-- say — and is enforced, not descriptive:
--   * student_id / employee_id reference the person directly, and the check
--     makes `type` agree with whichever one is set (exactly one is);
--   * the composite FKs pin (school_id, person, unique_id) to the person's own
--     row, so the enrollment can neither carry another person's machine id nor
--     point at another school's person;
--   * unique (unique_id) is global, matching the person tables' global ids —
--     a machine log entry carries only the id, never a tenant.
-- rfid_card_number is optional (a person may authenticate by fingerprint) and
-- unique per school, like rfid_cards.card_number was.
alter table public.students
  add constraint students_school_id_unique_id_key unique (school_id, id, unique_id);
alter table public.employees
  add constraint employees_school_id_unique_id_key unique (school_id, id, unique_id);

create table public.machine_enroll_infos (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  unique_id bigint not null,
  type text not null check (type in ('student', 'employee')),
  student_id uuid,
  employee_id uuid,
  rfid_card_number text check (rfid_card_number is null or btrim(rfid_card_number) <> ''),
  created_at timestamptz not null default now(),
  constraint machine_enroll_infos_type_matches_person check (
    (type = 'student' and student_id is not null and employee_id is null)
    or (type = 'employee' and employee_id is not null and student_id is null)
  ),
  constraint machine_enroll_infos_student_fkey
    foreign key (school_id, student_id, unique_id)
    references public.students (school_id, id, unique_id) on delete cascade,
  constraint machine_enroll_infos_employee_fkey
    foreign key (school_id, employee_id, unique_id)
    references public.employees (school_id, id, unique_id) on delete cascade,
  constraint machine_enroll_infos_unique_id_key unique (unique_id),
  constraint machine_enroll_infos_rfid_card_number_key unique (school_id, rfid_card_number)
);

-- Same reach as rfid_cards had after 0136: the School's own rows, behind the
-- Attendance grant; Super Admin keeps its own way in.
alter table public.machine_enroll_infos enable row level security;

create policy "school members manage machine enrollments" on public.machine_enroll_infos
  for all
  using (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')))
  with check (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')));

create policy "super admin manages machine enrollments" on public.machine_enroll_infos
  for all using (public.app_current_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- 6. Backfill from the legacy card sources.
--
-- A function rather than inline SQL because 0212 runs it again, to pick up
-- cards main's still-deployed code writes between the two migrations. It is
-- dropped by 0212.
--
-- It never guesses. If one person holds two different cards across the
-- sources (e.g. card A in rfid_cards, card B on their profile), or one card in
-- a school belongs to two people, it raises and the whole migration rolls back
-- — those have to be resolved by a person, and silently keeping one card would
-- lose the other without anyone noticing.
create or replace function public._copy_legacy_rfid_into_machine_enroll_infos() returns int
language plpgsql set search_path = public as $$
declare
  bad_people int;
  bad_cards int;
  copied int;
begin
  drop table if exists _card_claims;
  create temporary table _card_claims on commit drop as
  select school_id, card_number, student_id, employee_id from (
    select school_id, card_number, student_id, employee_id from rfid_cards
    union
    select school_id, rfid_card_number, id, null::uuid from students where rfid_card_number is not null
    union
    select school_id, rfid_card_number, null::uuid, id from employees where rfid_card_number is not null
    union
    select school_id, rfid_card_number, student_id, employee_id
      from machine_enroll_infos where rfid_card_number is not null
  ) c
  where btrim(card_number) <> '';

  select count(*) into bad_people from (
    select 1 from _card_claims
     group by student_id, employee_id having count(distinct card_number) > 1
  ) x;
  select count(*) into bad_cards from (
    select 1 from _card_claims
     group by school_id, card_number
    having count(distinct coalesce(student_id, employee_id)) > 1
  ) x;
  if bad_people > 0 or bad_cards > 0 then
    raise exception 'machine_enroll_infos backfill refused: % person(s) hold more than one card and % card(s) belong to more than one person across rfid_cards / students.rfid_card_number / employees.rfid_card_number / machine_enroll_infos — resolve them by hand, then re-run',
      bad_people, bad_cards;
  end if;

  -- A person already enrolled (by an earlier run) is left alone: the
  -- conflict checks above already proved their card agrees.
  insert into machine_enroll_infos (school_id, unique_id, type, student_id, employee_id, rfid_card_number)
  select c.school_id,
         coalesce(s.unique_id, e.unique_id),
         case when c.student_id is not null then 'student' else 'employee' end,
         c.student_id, c.employee_id, c.card_number
    from _card_claims c
    left join students s on s.id = c.student_id
    left join employees e on e.id = c.employee_id
   where not exists (
     select 1 from machine_enroll_infos m
      where m.student_id is not distinct from c.student_id
        and m.employee_id is not distinct from c.employee_id);

  get diagnostics copied = row_count;
  return copied;
end $$;

revoke execute on function public._copy_legacy_rfid_into_machine_enroll_infos() from public, anon, authenticated;

select public._copy_legacy_rfid_into_machine_enroll_infos();

-- ---------------------------------------------------------------------------
-- 7. Attendance resolves card taps through machine_enroll_infos.
--
-- Identical to 0210's reconcile_attendance except the `resolved` CTE, which
-- now reads the enrollment's explicit `type` instead of inferring it from
-- which rfid_cards column happened to be set.
CREATE OR REPLACE FUNCTION public.reconcile_attendance(job_secret text, target_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  upserted int;
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;

  with day_events as (
    select ae.school_id, ae.card_number, ae.tapped_at, ae.id
    from attendance_events ae
    join schools s on s.id = ae.school_id and s.automatic_attendance_enabled
    where not ae.processed
      and ae.tapped_at >= target_date::timestamptz
      and ae.tapped_at < (target_date + 1)::timestamptz
  ),
  resolved as (
    select de.id as event_id, de.school_id,
           m.type as person_type,
           coalesce(m.student_id, m.employee_id) as person_id,
           de.tapped_at
    from day_events de
    join machine_enroll_infos m on m.school_id = de.school_id and m.rfid_card_number = de.card_number
  ),
  collapsed as (
    select r.school_id, r.person_type, r.person_id,
           least(min(r.tapped_at), min(ar.entry_at)) as entry_at,
           nullif(
             greatest(max(r.tapped_at), max(ar.entry_at), max(ar.exit_at)),
             least(min(r.tapped_at), min(ar.entry_at))
           ) as exit_at
    from resolved r
    left join attendance_records ar
      on ar.school_id = r.school_id
     and ar.person_type = r.person_type
     and ar.person_id = r.person_id
     and ar.att_date = target_date
    group by r.school_id, r.person_type, r.person_id
  ),
  windows as (
    select c.*,
           case when c.person_type = 'employee' then (
             select min(ot.starts_at) from employee_office_times eot
             join office_times ot on ot.id = eot.office_time_id where eot.employee_id = c.person_id
           ) end as office_start,
           case when c.person_type = 'employee' then (
             select max(ot.ends_at) from employee_office_times eot
             join office_times ot on ot.id = eot.office_time_id where eot.employee_id = c.person_id
           ) end as office_end,
           case when c.person_type = 'employee' then (
             select coalesce(max(v), 0) from (
               select sgr.grace_minutes as v from employees e2
                 join standing_grace_rule_categories sgrc on sgrc.category = e2.category
                 join standing_grace_rules sgr
                   on sgr.id = sgrc.rule_id and sgr.school_id = e2.school_id
                 where e2.id = c.person_id
               union all
               select ahe.duration_minutes from employees e2
                 join ad_hoc_grace_exemption_categories ahec on ahec.category = e2.category
                 join ad_hoc_grace_exemptions ahe
                   on ahe.id = ahec.exemption_id
                  and ahe.school_id = e2.school_id
                  and ahe.exemption_date = target_date
                 where e2.id = c.person_id
             ) levels
           ) end as grace
    from collapsed c
  ),
  written as (
    insert into attendance_records (school_id, person_type, person_id, att_date, entry_at, exit_at, status)
    select school_id, person_type, person_id, target_date, entry_at, exit_at,
      case
        when person_type = 'student' or office_start is null or office_end is null then 'present'
        else (
          case
            when entry_at > (att_start + make_interval(mins => grace)) and exit_at is not null and exit_at < att_end then 'late_exit_early'
            when entry_at > (att_start + make_interval(mins => grace)) then 'late_entry'
            when exit_at is not null and exit_at < att_end then 'exit_early'
            else 'on_time'
          end
        )
      end
    from (
      select w.*,
             (target_date::timestamptz + w.office_start::interval) as att_start,
             (target_date::timestamptz + w.office_end::interval) as att_end
      from windows w
    ) final
    on conflict (person_type, person_id, att_date) do update
      set entry_at = excluded.entry_at,
          exit_at = excluded.exit_at,
          status = excluded.status
    returning 1
  ),
  consumed as (
    update attendance_events set processed = true
    where id in (select event_id from resolved)
    returning 1
  )
  select count(*) into upserted from written;

  return upserted;
end $function$
;
