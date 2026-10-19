-- Machine Attendance, Phase 3 (Architecture Baseline v1.1 §13, §14.2, §17.3-17.4,
-- §21.2; ADR 0033): attendance_machine_enrollments, the permanent history
-- of which person a device user ID belonged to on which machine, and when.
-- Schema only: nothing provisions, removes, resolves or imports yet.
--
-- One row is one ENROLLMENT EPISODE: a (machine_id, machine_user_id) ->
-- person assignment over a link window [linked_at, unlinked_at).
--   * linked_at   — set once, on the first verified sync (or an admin-confirmed
--                   import link); null while the episode is still pending.
--   * unlinked_at — set once, when removal is confirmed, the device is
--                   archived, or a never-linked episode is cancelled. Never
--                   cleared: re-enrolling creates a NEW episode.
-- The window is end-exclusive, the same as the resolution rule the reconcile
-- will use (tapped_at >= linked_at and tapped_at < unlinked_at): an episode
-- ending at T and the next one starting at T do not overlap.
--
-- Person reference (Baseline §21.2): entity_type + student_id / employee_id,
-- School-scoped, kept on the row itself so history still resolves after the
-- machine_enroll_infos row is gone; enroll_info_id is a convenience link that
-- becomes NULL when that row is deleted.
--
-- Expand-only. No trigger or function on any existing table changes.

-- Exclusion constraints over (uuid, text, range) need btree_gist's equality
-- operator classes for uuid and text. Supabase keeps extensions in the
-- `extensions` schema.
create extension if not exists btree_gist with schema extensions;

create table public.attendance_machine_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  machine_id uuid not null,
  enroll_info_id uuid references public.machine_enroll_infos (id) on delete set null,
  -- The ID as held on that device, normally the person's unique_id as text.
  machine_user_id text not null
    constraint attendance_machine_enrollments_machine_user_id_shape check (machine_user_id ~ '^\S{1,64}$'),
  entity_type text not null check (entity_type in ('student', 'employee')),
  student_id uuid,
  employee_id uuid,
  desired_state text not null default 'present' check (desired_state in ('present', 'absent')),
  sync_state text not null default 'pending'
    check (sync_state in ('pending', 'in_progress', 'synced', 'failed', 'drift', 'removed', 'cancelled')),
  linked_at timestamptz,
  unlinked_at timestamptz,
  machine_internal_uid integer,
  last_synced_card text,
  last_synced_name text,
  has_fingerprint boolean,
  last_command_id uuid,
  last_error text,
  desired_version integer not null default 1 check (desired_version >= 1),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_machine_enrollments_type_matches_person check (
    (entity_type = 'student' and student_id is not null and employee_id is null)
    or (entity_type = 'employee' and employee_id is not null and student_id is null)
  ),
  -- Same-School references (composite keys from 0020 / 0217).
  constraint attendance_machine_enrollments_machine_same_school
    foreign key (school_id, machine_id) references public.attendance_machines (school_id, id),
  constraint attendance_machine_enrollments_student_same_school
    foreign key (school_id, student_id) references public.students (school_id, id),
  constraint attendance_machine_enrollments_employee_same_school
    foreign key (school_id, employee_id) references public.employees (school_id, id),
  -- A window ends after it starts (strictly).
  constraint attendance_machine_enrollments_window_order
    check (unlinked_at is null or linked_at is null or unlinked_at > linked_at),
  -- Link windows of the same device user ID never overlap ([) ranges, so
  -- end == next start is allowed). Concurrency-safe: enforced by the index.
  constraint attendance_machine_enrollments_no_overlap
    exclude using gist (
      machine_id with =,
      machine_user_id with =,
      tstzrange(linked_at, coalesce(unlinked_at, 'infinity'::timestamptz)) with &&
    ) where (linked_at is not null)
);

comment on table public.attendance_machine_enrollments is
  'Enrollment episodes (ADR 0033): which person a device user ID meant on one machine, over [linked_at, unlinked_at). Permanent history; never reopened, never overlapping.';
comment on column public.attendance_machine_enrollments.linked_at is
  'Set once, on the first verified sync or an admin-confirmed import link. Start of the link window (inclusive).';
comment on column public.attendance_machine_enrollments.unlinked_at is
  'Set once (removal confirmed, device archived, or a never-linked episode cancelled); never cleared. End of the link window (exclusive).';

-- At most one open (pending or active) episode per device user ID.
create unique index attendance_machine_enrollments_one_open
  on public.attendance_machine_enrollments (machine_id, machine_user_id)
  where unlinked_at is null;

-- Resolution (machine, device user, punch time) and status screens.
create index attendance_machine_enrollments_resolution_idx
  on public.attendance_machine_enrollments (machine_id, machine_user_id, linked_at);
create index attendance_machine_enrollments_school_sync_idx
  on public.attendance_machine_enrollments (school_id, sync_state);
create index attendance_machine_enrollments_enroll_info_idx
  on public.attendance_machine_enrollments (enroll_info_id) where enroll_info_id is not null;
create index attendance_machine_enrollments_student_idx
  on public.attendance_machine_enrollments (student_id) where student_id is not null;
create index attendance_machine_enrollments_employee_idx
  on public.attendance_machine_enrollments (employee_id) where employee_id is not null;

-- ---------------------------------------------------------------------------
-- History guard (Baseline §21.2): an episode always means the same device
-- user ID on the same machine for the same person; its window opens once and
-- closes once and is never reopened. Operational state (desired_state,
-- sync_state, last_synced_*, errors, desired_version, synced_at) may change.
create function public.attendance_machine_enrollments_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.school_id is distinct from old.school_id
     or new.machine_id is distinct from old.machine_id
     or new.machine_user_id is distinct from old.machine_user_id
     or new.entity_type is distinct from old.entity_type
     or new.student_id is distinct from old.student_id
     or new.employee_id is distinct from old.employee_id
     or new.created_at is distinct from old.created_at then
    raise exception 'an enrollment episode''s machine, device user ID and person are immutable';
  end if;
  -- enroll_info_id may only fall to NULL (its machine_enroll_infos row was deleted).
  if new.enroll_info_id is distinct from old.enroll_info_id and new.enroll_info_id is not null then
    raise exception 'attendance_machine_enrollments.enroll_info_id can only be cleared';
  end if;
  if old.linked_at is not null and new.linked_at is distinct from old.linked_at then
    raise exception 'attendance_machine_enrollments.linked_at is set once';
  end if;
  if old.unlinked_at is not null and new.unlinked_at is distinct from old.unlinked_at then
    raise exception 'a closed enrollment episode cannot be reopened or re-dated';
  end if;
  -- A closed episode that never linked (cancelled) can never become linked.
  if old.unlinked_at is not null and old.linked_at is null and new.linked_at is not null then
    raise exception 'a cancelled enrollment episode cannot be linked';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger attendance_machine_enrollments_guard
  before update on public.attendance_machine_enrollments
  for each row execute function public.attendance_machine_enrollments_guard();

-- ---------------------------------------------------------------------------
-- Access. Read: the School's members behind the Attendance grant, and Super
-- Admin. Write: no School user path — provisioning, removal and import are
-- the later definer functions (Phases 6/9/10/11). Super Admin may insert and
-- update directly (maintenance and test fixtures), still under the guard.
-- No application role may delete an episode; deleting a School still removes
-- its rows by cascade.
revoke all on public.attendance_machine_enrollments from anon, authenticated;
grant select, insert, update on public.attendance_machine_enrollments to authenticated;

alter table public.attendance_machine_enrollments enable row level security;

create policy "school members read machine enrollments" on public.attendance_machine_enrollments
  for select
  using (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')));
create policy "super admin reads machine enrollments" on public.attendance_machine_enrollments
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin inserts machine enrollments" on public.attendance_machine_enrollments
  for insert with check (public.app_current_role() = 'super_admin');
create policy "super admin updates machine enrollments" on public.attendance_machine_enrollments
  for update
  using (public.app_current_role() = 'super_admin')
  with check (public.app_current_role() = 'super_admin');
