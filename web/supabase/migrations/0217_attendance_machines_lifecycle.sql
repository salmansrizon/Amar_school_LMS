-- Machine Attendance, Phase 3 slice 3B (Architecture Baseline v1.1 §17.4,
-- §21.1; ADR 0033): attendance_machines gains what the Attendance Agent needs
-- to reach and identify a device, and the archive / restore / replace
-- lifecycle. Expand-only: every new column is nullable or has a default, so
-- the Machine Setup code deployed on main keeps working unchanged.
--
-- Column ownership:
--   * School-editable configuration (Machine Setup): the 0213 columns, plus
--     host, port, driver_key, time_zone, enabled, agent_id.
--   * Agent-reported device facts: firmware_version, platform, device_name,
--     mac, pin_width, capabilities, credential_configured,
--     credential_reported_at, probed_serial, serial_verified_at. Written by
--     the Phase 6 definer RPCs; a School user cannot write them.
--   * Lifecycle: archived_at, archived_by, replaces_machine_id. Written only
--     by archive/restore/replace below.
--   (Super Admin keeps direct access to every column, as 0213 gave it.)
--
-- Device communication keys are NOT stored here (ADR 0033): only the
-- Agent-reported credential_configured flag.
--
-- Lifecycle (Baseline §17.4): a used machine is archived and restored, never
-- deleted; replacement hardware gets a NEW row that points at the old one.
-- "Used" is enforced by foreign keys from the rows that record use (later
-- slices add attendance_events.machine_id and the enrollment episodes with
-- the default NO ACTION / restrict), so a delete of a used machine fails at
-- the database and Machine Setup offers Archive instead. A machine that has
-- been replaced is already referenced by its replacement.

-- ---------------------------------------------------------------------------
-- 1. Columns.
alter table public.attendance_machines
  add column agent_id uuid,
  add column host text check (host is null or (char_length(host) between 1 and 253 and host !~ '\s')),
  add column port integer not null default 4370 check (port between 1 and 65535),
  add column driver_key text not null default 'auto' check (driver_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  add column time_zone text,
  add column credential_configured boolean not null default false,
  add column credential_reported_at timestamptz,
  add column firmware_version text check (char_length(firmware_version) <= 128),
  add column platform text check (char_length(platform) <= 128),
  add column device_name text check (char_length(device_name) <= 128),
  add column mac text check (char_length(mac) <= 64),
  add column pin_width smallint check (pin_width between 1 and 32),
  add column capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  add column probed_serial text check (char_length(probed_serial) <= 128),
  add column serial_verified_at timestamptz,
  add column enabled boolean not null default true,
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null,
  add column replaces_machine_id uuid;

comment on column public.attendance_machines.time_zone is
  'IANA zone the device clock runs in. Defaults to the School''s time zone. The server converts Device Local Time with it (ADR 0033).';
comment on column public.attendance_machines.credential_configured is
  'Reported by the Attendance Agent: a device communication key is set on the Agent PC. The key itself never reaches the cloud.';
comment on column public.attendance_machines.probed_serial is
  'Serial number the device itself reported on its first verified probe. Set once.';

-- Same-School references (the composite FKs 0020 introduced for cards).
alter table public.attendance_machines
  add constraint attendance_machines_school_scoped unique (school_id, id),
  add constraint attendance_machines_agent_same_school
    foreign key (school_id, agent_id) references public.attendance_agents (school_id, id),
  add constraint attendance_machines_replaces_same_school
    foreign key (school_id, replaces_machine_id) references public.attendance_machines (school_id, id),
  add constraint attendance_machines_replaces_once unique (replaces_machine_id),
  add constraint attendance_machines_not_self_replacement check (replaces_machine_id is distinct from id),
  add constraint attendance_machines_serial_verified_complete
    check ((probed_serial is null) = (serial_verified_at is null)),
  add constraint attendance_machines_archive_complete
    check (archived_at is not null or archived_by is null);

-- time_zone: existing rows take their School's zone; new rows default to it
-- by trigger (a column default cannot read another table).
update public.attendance_machines m
   set time_zone = s.time_zone
  from public.schools s
 where s.id = m.school_id;

create function public.attendance_machines_default_time_zone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.time_zone is null then
    select s.time_zone into new.time_zone from schools s where s.id = new.school_id;
  end if;
  return new;
end $$;

revoke execute on function public.attendance_machines_default_time_zone() from public, anon, authenticated;

create trigger attendance_machines_default_time_zone
  before insert on public.attendance_machines
  for each row execute function public.attendance_machines_default_time_zone();

alter table public.attendance_machines
  alter column time_zone set not null,
  add constraint attendance_machines_time_zone_valid check (public.is_valid_time_zone(time_zone));

create index attendance_machines_agent_idx on public.attendance_machines (agent_id) where agent_id is not null;
create index attendance_machines_active_idx on public.attendance_machines (school_id) where archived_at is null;

-- ---------------------------------------------------------------------------
-- 2. Guard: who may change which column, and what never changes.
--
-- A School user (role authenticated, not Super Admin) writes configuration
-- only. Agent-reported and lifecycle columns change only inside the definer
-- functions (current_user is then the function owner, not a client role) or
-- for Super Admin. Independently of who writes:
--   * probed_serial / serial_verified_at are set once (the serial lock);
--   * once the serial is verified, serial_number can no longer be edited;
--   * an archived machine's configuration is frozen until it is restored;
--   * replaces_machine_id never changes once set.
create function public.attendance_machines_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  is_client boolean := current_user in ('authenticated', 'anon')
    and public.app_current_role() is distinct from 'super_admin'::public.app_role;
begin
  if tg_op = 'INSERT' then
    if is_client and (
         new.firmware_version is not null or new.platform is not null or new.device_name is not null
         or new.mac is not null or new.pin_width is not null or new.capabilities <> '{}'::jsonb
         or new.credential_configured or new.credential_reported_at is not null
         or new.probed_serial is not null or new.serial_verified_at is not null
         or new.archived_at is not null or new.archived_by is not null or new.replaces_machine_id is not null) then
      raise exception 'only the Attendance Agent or the machine lifecycle functions set these attendance_machines columns';
    end if;
    return new;
  end if;

  if new.school_id is distinct from old.school_id or new.created_at is distinct from old.created_at then
    raise exception 'attendance_machines.school_id and created_at are immutable';
  end if;
  if old.replaces_machine_id is not null and new.replaces_machine_id is distinct from old.replaces_machine_id then
    raise exception 'attendance_machines.replaces_machine_id is immutable once set';
  end if;
  if old.probed_serial is not null and (new.probed_serial is distinct from old.probed_serial
     or new.serial_verified_at is distinct from old.serial_verified_at) then
    raise exception 'the verified serial of an attendance machine cannot be changed';
  end if;
  if old.serial_verified_at is not null and new.serial_number is distinct from old.serial_number then
    raise exception 'the serial number of a verified attendance machine cannot be changed';
  end if;

  if is_client and (
       new.firmware_version is distinct from old.firmware_version or new.platform is distinct from old.platform
       or new.device_name is distinct from old.device_name or new.mac is distinct from old.mac
       or new.pin_width is distinct from old.pin_width or new.capabilities is distinct from old.capabilities
       or new.credential_configured is distinct from old.credential_configured
       or new.credential_reported_at is distinct from old.credential_reported_at
       or new.probed_serial is distinct from old.probed_serial or new.serial_verified_at is distinct from old.serial_verified_at
       or new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by
       or new.replaces_machine_id is distinct from old.replaces_machine_id) then
    raise exception 'only the Attendance Agent or the machine lifecycle functions change these attendance_machines columns';
  end if;

  -- Archived: frozen except for being restored (archived_at cleared) or the
  -- Agent-reported facts that a late report may still carry.
  if old.archived_at is not null and new.archived_at is not null and (
       new.machine_type is distinct from old.machine_type or new.model is distinct from old.model
       or new.serial_number is distinct from old.serial_number or new.location is distinct from old.location
       or new.shift_scope is distinct from old.shift_scope or new.shift is distinct from old.shift
       or new.note is distinct from old.note or new.host is distinct from old.host or new.port is distinct from old.port
       or new.driver_key is distinct from old.driver_key or new.time_zone is distinct from old.time_zone
       or new.enabled is distinct from old.enabled or new.agent_id is distinct from old.agent_id) then
    raise exception 'an archived attendance machine cannot be edited; restore it first';
  end if;
  return new;
end $$;

create trigger attendance_machines_guard
  before insert or update on public.attendance_machines
  for each row execute function public.attendance_machines_guard();

-- ---------------------------------------------------------------------------
-- 3. Lifecycle functions. Same reach as the table's own policy: the caller's
-- School behind the Attendance grant, or Super Admin.
create function public._attendance_machine_for_caller(target uuid)
returns public.attendance_machines
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines;
begin
  select * into m from attendance_machines where id = target for update;
  if m.id is null
     or not (public.app_current_role() = 'super_admin'
             or (m.school_id = public.app_current_school_id() and public.app_module_granted('attendance'))) then
    raise exception 'attendance machine not found' using errcode = 'P0002';
  end if;
  return m;
end $$;

revoke execute on function public._attendance_machine_for_caller(uuid) from public, anon, authenticated;

-- Archive: the machine stops being a device the School works with (the Agent
-- will leave it out of its config) but keeps every row that refers to it.
-- Archiving an archived machine is a no-op.
create function public.archive_attendance_machine(machine_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines := public._attendance_machine_for_caller(machine_id);
begin
  if m.archived_at is null then
    update attendance_machines
       set archived_at = now(), archived_by = auth.uid(), updated_at = now()
     where id = m.id;
  end if;
end $$;

-- Restore: back in service. A machine that has been replaced stays archived —
-- its replacement is the device now.
create function public.restore_attendance_machine(machine_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines := public._attendance_machine_for_caller(machine_id);
begin
  if exists (select 1 from attendance_machines r where r.replaces_machine_id = m.id) then
    raise exception 'this attendance machine was replaced and cannot be restored' using errcode = 'P0001';
  end if;
  if m.archived_at is not null then
    update attendance_machines
       set archived_at = null, archived_by = null, updated_at = now()
     where id = m.id;
  end if;
end $$;

-- Replace: new hardware for the same place. One transaction creates the new
-- row (same configuration, the new serial and model) pointing at the old one,
-- and archives the old one. The new row starts with no Agent-reported facts.
-- (Carrying enrollments over to the new device is added with the enrollment
-- episodes in a later slice, Baseline §17.3.)
create function public.replace_attendance_machine(machine_id uuid, new_serial_number text, new_model text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines := public._attendance_machine_for_caller(machine_id);
  new_id uuid;
begin
  if exists (select 1 from attendance_machines r where r.replaces_machine_id = m.id) then
    raise exception 'this attendance machine was already replaced' using errcode = 'P0001';
  end if;
  insert into attendance_machines
    (school_id, machine_type, model, serial_number, location, shift_scope, shift, note,
     host, port, driver_key, time_zone, enabled, agent_id, replaces_machine_id)
  values
    (m.school_id, m.machine_type, coalesce(nullif(btrim(new_model), ''), m.model), btrim(new_serial_number),
     m.location, m.shift_scope, m.shift, m.note,
     m.host, m.port, m.driver_key, m.time_zone, m.enabled, m.agent_id, m.id)
  returning id into new_id;
  if m.archived_at is null then
    update attendance_machines
       set archived_at = now(), archived_by = auth.uid(), updated_at = now()
     where id = m.id;
  end if;
  return new_id;
end $$;

revoke execute on function public.archive_attendance_machine(uuid) from public, anon;
revoke execute on function public.restore_attendance_machine(uuid) from public, anon;
revoke execute on function public.replace_attendance_machine(uuid, text, text) from public, anon;
grant execute on function public.archive_attendance_machine(uuid) to authenticated;
grant execute on function public.restore_attendance_machine(uuid) to authenticated;
grant execute on function public.replace_attendance_machine(uuid, text, text) to authenticated;
