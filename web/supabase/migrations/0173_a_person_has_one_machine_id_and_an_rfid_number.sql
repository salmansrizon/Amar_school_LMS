-- 0173_a_person_has_one_machine_id_and_an_rfid_number.sql
-- Ticket #564: prep the data model for future attendance-machine integration
-- (ZKTeco/TIMMY + a Windows sync service — architecture not designed here,
-- explained separately). Every Student and Employee gets a `unique_id` a
-- physical attendance machine can use as a bare user id with no tenant
-- context (stu/emp-prefixed, globally unique across every school), and an
-- `rfid_card_number` for card-based auth. Neither field does anything yet —
-- no machine communication, no sync service, no ingest wiring, no enrollment
-- workflow. Additive only; staging and main share one Supabase project.
--
-- `rfid_card_number` deliberately overlaps what `rfid_cards`
-- (0017_rfid_attendance.sql) already models: that table already links a
-- card_number to a student_id/employee_id, per-school-unique, wired into a
-- working ingest/reconcile pipeline (ingest_attendance_events,
-- reconcile_attendance, web/app/api/attendance/ingest/[schoolId]). This
-- migration does not touch it, and the two paths coexist until the future
-- sync-architecture conversation decides whether one replaces the other.

-- ---------------------------------------------------------------------------
-- 1. unique_id: two global sequences, not per-school counters.
--
-- invoice_number_seq (0086_invoicing_payments.sql) was replaced by a
-- row-locked counter (0168_invoice_numbers_are_gapless_by_construction.sql)
-- because invoicing has a hard gapless requirement (ADR 0012) and a Postgres
-- sequence's nextval does not roll back with its transaction. Nothing here
-- needs to be gapless — a machine identifier skipping a number is
-- unobservable to anyone — so a plain sequence is the right tool, not an
-- over-correction copied from 0168: it's lock-free, which matters more here
-- than it did for one school's invoices, since this counter is shared by
-- every school on the platform.
create sequence if not exists public.student_unique_id_seq;
create sequence if not exists public.employee_unique_id_seq;

-- One formula, not four: the backfill and both auto-assign triggers all need
-- "next value, prefixed and zero-padded to 8 digits" — a shared function
-- means there's exactly one place to widen the format if the platform ever
-- gets near 99,999,999 students or employees, instead of a formula
-- copy-pasted at every call site and only some of them updated. lpad()
-- truncates (keeps the leftmost digits) rather than erroring when its input
-- is already longer than the target width, which would silently collide two
-- different sequence values onto the same id — so this raises instead of
-- ever reaching lpad with a 9-digit input.
create or replace function public.next_person_unique_id(prefix text, seq regclass) returns text
language plpgsql as $$
declare n bigint;
begin
  n := nextval(seq);
  if n > 99999999 then
    raise exception '% is out of 8-digit unique_id budget — widen the format (students_unique_id_format / employees_unique_id_format) before assigning more', seq;
  end if;
  return prefix || lpad(n::text, 8, '0');
end $$;

alter table public.students
  add column if not exists unique_id text,
  add column if not exists rfid_card_number text;

alter table public.employees
  add column if not exists unique_id text,
  add column if not exists rfid_card_number text;

-- ---------------------------------------------------------------------------
-- 2. Format constraints (added before backfill — existing rows are still
--    null here, and "null or matches format" allows that).
alter table public.students drop constraint if exists students_unique_id_format;
alter table public.students add constraint students_unique_id_format
  check (unique_id is null or unique_id ~ '^stu[0-9]{8}$');

alter table public.employees drop constraint if exists employees_unique_id_format;
alter table public.employees add constraint employees_unique_id_format
  check (unique_id is null or unique_id ~ '^emp[0-9]{8}$');

-- ---------------------------------------------------------------------------
-- 3. Backfill every existing row, then make the column mandatory — no
--    Student or Employee is ever without a machine id, and no "assign ids"
--    chore exists for the ones already admitted before this migration.
update public.students set unique_id = 'stu' || lpad(nextval('student_unique_id_seq')::text, 8, '0')
where unique_id is null;

update public.employees set unique_id = 'emp' || lpad(nextval('employee_unique_id_seq')::text, 8, '0')
where unique_id is null;

alter table public.students alter column unique_id set not null;
alter table public.employees alter column unique_id set not null;

-- Global — no school_id in either index. This is the whole point: a machine
-- log entry carries only the stu/emp id, never a tenant, so the id alone must
-- resolve to exactly one person platform-wide.
create unique index if not exists students_unique_id_key on public.students (unique_id);
create unique index if not exists employees_unique_id_key on public.employees (unique_id);

-- ---------------------------------------------------------------------------
-- 4. Auto-assign at insert. Unconditional in practice — nothing in the app
--    ever submits a unique_id from a form — but the null-guard (matching
--    assign_student_no's shape, 0131_student_foundation.sql) leaves room for
--    a future data migration or seed script to supply one explicitly.
create or replace function public.assign_student_unique_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unique_id is null then
    new.unique_id := 'stu' || lpad(nextval('student_unique_id_seq')::text, 8, '0');
  end if;
  return new;
end $$;

drop trigger if exists student_assign_unique_id on public.students;
create trigger student_assign_unique_id
  before insert on public.students
  for each row execute function public.assign_student_unique_id();

create or replace function public.assign_employee_unique_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unique_id is null then
    new.unique_id := 'emp' || lpad(nextval('employee_unique_id_seq')::text, 8, '0');
  end if;
  return new;
end $$;

drop trigger if exists employee_assign_unique_id on public.employees;
create trigger employee_assign_unique_id
  before insert on public.employees
  for each row execute function public.assign_employee_unique_id();

-- ---------------------------------------------------------------------------
-- 5. Immutable after insert — it's a permanent machine identifier, the same
--    reasoning as student_no's own immutability trigger
--    (enforce_student_no_immutable, 0131_student_foundation.sql). The column
--    is NOT NULL (unlike student_no), so old.unique_id is never null here —
--    no extra guard needed before comparing. `before update of unique_id`
--    (not a bare `before update`, unlike 0131's version of this trigger) —
--    every other profile edit, on every school, skips this trigger's
--    invocation entirely rather than firing and no-op-ing every time.
create or replace function public.enforce_student_unique_id_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.unique_id is distinct from old.unique_id then
    raise exception 'unique_id is immutable';
  end if;
  return new;
end $$;

drop trigger if exists student_unique_id_immutable on public.students;
create trigger student_unique_id_immutable
  before update of unique_id on public.students
  for each row execute function public.enforce_student_unique_id_immutable();

create or replace function public.enforce_employee_unique_id_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.unique_id is distinct from old.unique_id then
    raise exception 'unique_id is immutable';
  end if;
  return new;
end $$;

drop trigger if exists employee_unique_id_immutable on public.employees;
create trigger employee_unique_id_immutable
  before update of unique_id on public.employees
  for each row execute function public.enforce_employee_unique_id_immutable();

-- ---------------------------------------------------------------------------
-- 6. rfid_card_number: per-school unique only (matches rfid_cards'
--    card_unique_per_school — not a global-uniqueness rule), nullable (most
--    people won't have a card assigned yet), no format constraint — card
--    formats vary by reader vendor, matching rfid_cards.card_number's own
--    lack of one.
--
--    Update, issue #565: this column now has a UI (admission-form.tsx's and
--    create-form.tsx's ProfileFields, plus a read-only InfoRow on both detail
--    pages) — deliberately NOT kept in sync with
--    web/app/school/attendance/card-controls.tsx's separate "assign a card"
--    flow into rfid_cards, which stays the one path that actually feeds
--    ingest_attendance_events/reconcile_attendance. #565 weighed the
--    two-independent-fields risk this comment used to warn about and chose a
--    UI hint pointing each screen at the other over reconciling them now.
--    Whether this column ends up mirroring rfid_cards, or rfid_cards is
--    retired in its favor, remains a call for the future sync-architecture
--    ticket.
create unique index if not exists students_rfid_card_number_key
  on public.students (school_id, rfid_card_number) where rfid_card_number is not null;

create unique index if not exists employees_rfid_card_number_key
  on public.employees (school_id, rfid_card_number) where rfid_card_number is not null;
