-- Machine Attendance, Phase 3 (Architecture Baseline v1.1 §14.2, §17.3, §17.4;
-- ADR 0033): the machine lifecycle (0217) now carries the enrollment episodes
-- (0220) and the command queue (0221) with it. Required before provisioning
-- (Phase 9/10). Replaces the bodies of archive_attendance_machine,
-- restore_attendance_machine and replace_attendance_machine (same signatures,
-- same caller rule) and adds three internal helpers. No table changes.
--
-- ARCHIVE (§17.4) — in one transaction, once (archiving an archived machine
-- stays a no-op). One archive instant is used for everything: archived_at,
-- every episode closed by the archive, and every command it cancels. It is
-- now(), unless an open episode was (anomalously) linked at or after now();
-- then it is just after the latest such linked_at, so that every closed
-- window still ends after it starts AND ends exactly at archived_at. No
-- episode ever stays valid past the machine's archived_at.
--   * the machine gets archived_at = the archive instant and enabled = false
--     (Archived, §17.4 state diagram);
--   * every OPEN episode of the machine is closed, never deleted:
--       - linked (active) episodes: unlinked_at = archived_at. Punches up to
--         that moment, even uploaded late, still resolve to them;
--       - pending (never-linked) episodes: closed as cancelled
--         (unlinked_at = archived_at, sync_state = 'cancelled', linked_at
--         stays null), so they never match any punch;
--     desired_state is left as it was: it records who was still wanted on the
--     device, which is what restore and replace re-create;
--   * every unfinished command for the machine (pending, claimed, running) is
--     cancelled: completed_at = archived_at, lease and claim token cleared, so it is never
--     handed out again and a late report from an in-flight claim is stale.
--     Finished commands and Agent-wide commands (no machine) are untouched.
--
-- RESTORE (§17.4) — the same physical machine (same row and machine_id) back in
-- service: archived_at cleared and enabled = true (Active). A replaced machine
-- still cannot be restored. Closed episodes stay
-- closed. Everyone still desired on the device when it was archived gets a NEW
-- pending episode (same machine_user_id and person; linked on its next verified
-- sync, Phase 9/10). People who were being removed (desired_state 'absent')
-- are not re-created.
--
-- REPLACE (§17.3) — new hardware is a NEW machine row with the new-machine
-- default enabled = true; the old row is archived exactly as above (archived_at
-- set, enabled = false) unless it already was, and everyone still
-- desired on the old device gets a NEW pending episode on the new row with the
-- same machine_user_id. Old episodes keep pointing at the old machine, so old
-- punches (which carry the old machine_id) can never resolve through the new
-- hardware.
--
-- "Still desired on the device" = the most recent episode per device user ID
-- among those closed at or after the machine's archived_at, with
-- desired_state = 'present'. New episodes never collide with an open one: if
-- the device user ID already has an open episode on the target machine, it is
-- left as is (the one-open-episode invariant holds).
--
-- No command is created here: provisioning (PROVISION_PERSON) for pending
-- episodes is the Phase 9/10 engine's job.

-- ---------------------------------------------------------------------------
-- Internal helpers (definer; not callable by client roles).

-- The archive instant for a machine: now(), or just after the latest linked_at
-- of its open episodes when that is not earlier than now() (clock skew or a
-- future-dated link), so every closed window ends after it starts.
create function public._machine_archive_instant(target_machine uuid)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(
    now(),
    (select max(e.linked_at) + interval '1 millisecond'
       from attendance_machine_enrollments e
      where e.machine_id = target_machine and e.unlinked_at is null and e.linked_at is not null)
  );
$$;

-- Closes every open episode of a machine at exactly closed_at (the machine's
-- archived_at); returns how many.
create function public._close_machine_episodes(target_machine uuid, closed_at timestamptz)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update attendance_machine_enrollments e
     set unlinked_at = closed_at,
         sync_state = case when e.linked_at is null then 'cancelled' else e.sync_state end
   where e.machine_id = target_machine
     and e.unlinked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Cancels every unfinished command of a machine at cancelled_at; returns how many.
create function public._cancel_machine_commands(target_machine uuid, reason text, cancelled_at timestamptz)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update machine_commands c
     set status = 'cancelled', completed_at = cancelled_at, error_detail = reason,
         claim_token = null, lease_expires_at = null
   where c.machine_id = target_machine
     and c.status in ('pending', 'claimed', 'running');
  get diagnostics n = row_count;
  return n;
end $$;

-- Creates a new pending episode on target_machine for everyone still desired on
-- source_machine when it was archived (episodes closed at or after
-- archived_since with desired_state 'present'); returns how many.
create function public._recreate_desired_episodes(source_machine uuid, target_machine uuid, archived_since timestamptz)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into attendance_machine_enrollments as ame
    (school_id, machine_id, enroll_info_id, machine_user_id, entity_type, student_id, employee_id,
     desired_state, sync_state)
  select d.school_id, target_machine, d.enroll_info_id, d.machine_user_id, d.entity_type, d.student_id, d.employee_id,
         'present', 'pending'
    from (
      select distinct on (e.machine_user_id) e.*
        from attendance_machine_enrollments e
       where e.machine_id = source_machine
         and e.unlinked_at is not null
         and e.unlinked_at >= archived_since
       order by e.machine_user_id, e.created_at desc
    ) d
   where d.desired_state = 'present'
  on conflict (machine_id, machine_user_id) where unlinked_at is null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public._machine_archive_instant(uuid) from public, anon, authenticated;
revoke execute on function public._close_machine_episodes(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public._cancel_machine_commands(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public._recreate_desired_episodes(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public lifecycle functions (same signatures and caller rule as 0217).

create or replace function public.archive_attendance_machine(machine_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines := public._attendance_machine_for_caller(machine_id);
  archived timestamptz;
begin
  if m.archived_at is null then
    archived := public._machine_archive_instant(m.id);
    update attendance_machines
       set archived_at = archived, archived_by = auth.uid(), enabled = false, updated_at = now()
     where id = m.id;
    perform public._close_machine_episodes(m.id, archived);
    perform public._cancel_machine_commands(m.id, 'machine archived', archived);
  end if;
end $$;

create or replace function public.restore_attendance_machine(machine_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines := public._attendance_machine_for_caller(machine_id);
begin
  if exists (select 1 from attendance_machines r where r.replaces_machine_id = m.id) then
    raise exception 'this attendance machine was replaced and cannot be restored' using errcode = 'P0001';
  end if;
  if m.archived_at is not null then
    update attendance_machines
       set archived_at = null, archived_by = null, enabled = true, updated_at = now()
     where id = m.id;
    perform public._recreate_desired_episodes(m.id, m.id, m.archived_at);
  end if;
end $$;

create or replace function public.replace_attendance_machine(machine_id uuid, new_serial_number text, new_model text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines := public._attendance_machine_for_caller(machine_id);
  new_id uuid;
  archived timestamptz := coalesce(m.archived_at, public._machine_archive_instant(m.id));
begin
  if exists (select 1 from attendance_machines r where r.replaces_machine_id = m.id) then
    raise exception 'this attendance machine was already replaced' using errcode = 'P0001';
  end if;
  insert into attendance_machines
    (school_id, machine_type, model, serial_number, location, shift_scope, shift, note,
     host, port, driver_key, time_zone, agent_id, replaces_machine_id)
  values
    (m.school_id, m.machine_type, coalesce(nullif(btrim(new_model), ''), m.model), btrim(new_serial_number),
     m.location, m.shift_scope, m.shift, m.note,
     m.host, m.port, m.driver_key, m.time_zone, m.agent_id, m.id)
  returning id into new_id;
  if m.archived_at is null then
    update attendance_machines
       set archived_at = archived, archived_by = auth.uid(), enabled = false, updated_at = now()
     where id = m.id;
    perform public._close_machine_episodes(m.id, archived);
    perform public._cancel_machine_commands(m.id, 'machine replaced', archived);
  end if;
  perform public._recreate_desired_episodes(m.id, new_id, archived);
  return new_id;
end $$;
