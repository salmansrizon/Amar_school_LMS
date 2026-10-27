-- Machine Attendance, Phase 9 (Architecture Baseline v1.1 §14, §16, §21-22;
-- ADR 0033): provisioning people onto attendance machines. FUNCTIONS AND ONE
-- TRIGGER ONLY: no table, column, constraint, index, policy or data change.
-- 0220 left the enrollment-episode writers to this phase ("provisioning,
-- removal and import are the later definer functions"); 0221 left command
-- creation to each feature.
--
--   enqueue_attendance_provisioning(entity_type, person_ids, machine_ids, existing_only)
--       School-side planner + writer: per (person, machine) it either opens a
--       pending episode or bumps the open one, and queues one desired-state
--       PROVISION_PERSON command - or returns why not.
--   machine_commands_provision_result (trigger)
--       when a PROVISION_PERSON command is claimed or completed, applies the
--       outcome to its episode. An episode links only on a VERIFIED result.
--
-- Authority: _attendance_machine_for_caller (0217, 0266 rule): the machine
-- must be in the caller's School and the caller an employee-attendance
-- administrator (Attendance grant AND (School Owner OR Staff User with no
-- employees row)), or Super Admin. Every person must be in the machine's
-- School. Desired values (machine user ID, card, name) are read here, never
-- taken from the caller.
--
-- Capability-gated (the machine's VERIFIED capabilities, attendance_machines.
-- capabilities from the Phase 6 probe): a machine never probed cannot be
-- provisioned; a card-less person is refused where the device cannot create
-- card-less users; a card is refused when it is not decimal digits within
-- maxCardValue; a machine user ID wider than maxMachineUserIdDigits is
-- refused. Nothing impossible is ever queued.
--
-- Removal (OD-6 is OPEN): this migration never queues REMOVE_PERSON and never
-- closes an episode because a card was cleared. A person still on a device
-- whose LMS card row was cleared is reported 'errManualRemovalRequired' (the
-- device cannot delete users, e.g. TIMY TM52GPRS) or 'errRemovalUndecided'.
--
-- Episode lifecycle (Baseline §14.2): one open episode per (machine, machine
-- user ID). A card or name change bumps desired_version on the SAME open
-- episode. A first enrollment opens a pending episode (linked_at null). The
-- result trigger sets linked_at once, at the first verified sync. Closed
-- episodes are never touched.
--
-- Reasons (stable codes): errMachineNotFound, errMachineNotInService,
-- errNoAgent, errCapabilitiesUnknown, errUnsupported, errNotFound,
-- errNotEligible, errMachineIdTooWide, errNoCard, errInvalidCard,
-- errCardClearUnsupported, errMachineIdConflict, errRemovalPending,
-- errManualRemovalRequired, errRemovalUndecided.
-- Outcomes: created, updated, retried, unchanged, alreadyPending.

-- ---------------------------------------------------------------------------
-- 1. Helpers (internal).

-- The card as compared with the device's read-back: devices that store cards
-- numerically drop leading zeros (TM52GPRS: 0004972001 -> 4972001).
create function public._provision_card_key(card text, preserves_leading_zeros boolean)
returns text
language sql immutable set search_path = public as $$
  select case when card is null then null
              when preserves_leading_zeros then card
              else coalesce(nullif(ltrim(card, '0'), ''), '0') end
$$;

-- The name the device can hold: printable ASCII only unless the device stores
-- Unicode, whitespace collapsed, cut to the device's length. Falls back to the
-- machine user ID when nothing printable remains (e.g. a Bengali-only name on
-- an ASCII device). The driver refuses, never truncates, so this is where the
-- name is fitted.
create function public._provision_device_name(full_name text, max_length integer, unicode boolean, fallback text)
returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(rtrim(left(regexp_replace(btrim(
           case when unicode then coalesce(full_name, '') else regexp_replace(coalesce(full_name, ''), '[^\x20-\x7E]', '', 'g') end),
           '\s+', ' ', 'g'), greatest(coalesce(max_length, 64), 1))), ''), fallback)
$$;

revoke execute on function public._provision_card_key(text, boolean) from public, anon, authenticated;
revoke execute on function public._provision_device_name(text, integer, boolean, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The planner + writer.
create function public.enqueue_attendance_provisioning(
  entity_type text, person_ids uuid[], machine_ids uuid[], existing_only boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  pid uuid;
  m attendance_machines;
  caps jsonb;
  machine_reason text;
  reason text;
  full_name text;
  archived timestamptz;
  uid bigint;
  info machine_enroll_infos;
  ep attendance_machine_enrollments;
  card text;
  desired_name text;
  open_cmd machine_commands;
  cmd_id uuid;
  outcome text;
  version integer;
  queued jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
begin
  if entity_type not in ('student', 'employee') or person_ids is null or machine_ids is null
     or cardinality(person_ids) not between 1 and 2000 or cardinality(machine_ids) not between 1 and 20 then
    raise exception 'invalid provisioning request' using errcode = '22023';
  end if;

  foreach mid in array (select array_agg(distinct x) from unnest(machine_ids) x) loop
    machine_reason := null;
    begin
      m := public._attendance_machine_for_caller(mid);
    exception when sqlstate 'P0002' then
      machine_reason := 'errMachineNotFound';
    end;
    if machine_reason is null then
      caps := coalesce(m.capabilities, '{}'::jsonb);
      if m.archived_at is not null or not m.enabled then
        machine_reason := 'errMachineNotInService';
      elsif m.agent_id is null or not exists (select 1 from attendance_agents ag where ag.id = m.agent_id and ag.status = 'active') then
        machine_reason := 'errNoAgent';
      elsif caps = '{}'::jsonb or caps -> 'canWriteUsers' is null then
        machine_reason := 'errCapabilitiesUnknown'; -- run Test Connection first
      elsif not (caps ->> 'canWriteUsers')::boolean then
        machine_reason := 'errUnsupported';
      end if;
    end if;

    foreach pid in array (select array_agg(distinct x) from unnest(person_ids) x) loop
      if machine_reason is not null then
        if not existing_only then
          skipped := skipped || jsonb_build_object('personId', pid, 'machineId', mid, 'reason', machine_reason);
        end if;
        continue;
      end if;
      reason := null;
      outcome := null;
      full_name := null;
      archived := null;
      uid := null;
      info := null;
      ep := null;
      open_cmd := null;
      cmd_id := null;

      if entity_type = 'student' then
        select s.full_name, s.archived_at, s.unique_id into full_name, archived, uid from students s where s.id = pid and s.school_id = m.school_id;
        if found then
          select * into info from machine_enroll_infos mi where mi.student_id = pid and mi.school_id = m.school_id;
        end if;
      else
        select e.full_name, e.archived_at, e.unique_id into full_name, archived, uid from employees e where e.id = pid and e.school_id = m.school_id;
        if found then
          select * into info from machine_enroll_infos mi where mi.employee_id = pid and mi.school_id = m.school_id;
        end if;
      end if;

      if uid is null and full_name is null then
        reason := 'errNotFound';
      else
        select * into ep from attendance_machine_enrollments e
         where e.machine_id = m.id and e.machine_user_id = uid::text and e.unlinked_at is null for update;
        card := info.rfid_card_number;
        if ep.id is not null and (ep.entity_type <> entity_type or coalesce(ep.student_id, ep.employee_id) <> pid) then
          reason := 'errMachineIdConflict';
        elsif ep.id is not null and ep.desired_state = 'absent' then
          reason := 'errRemovalPending';
        elsif info.id is null and ep.id is not null and ep.linked_at is not null then
          -- The LMS card row is gone but the person is still on the device: removal is not automatic (OD-6 open).
          reason := case when coalesce((caps ->> 'canDeleteUsers')::boolean, false) then 'errRemovalUndecided' else 'errManualRemovalRequired' end;
        elsif archived is not null or info.id is null then
          reason := 'errNotEligible';
        elsif length(uid::text) > coalesce((caps ->> 'maxMachineUserIdDigits')::integer, 9) then
          reason := 'errMachineIdTooWide';
        elsif card is null and (entity_type = 'student' or not coalesce((caps ->> 'canCreateUsersWithoutCard')::boolean, false)) then
          -- Students always need a card (OD-6 has not allowed fingerprint-only students).
          reason := case when ep.last_synced_card is not null and not coalesce((caps ->> 'canClearCardKeepingUser')::boolean, false)
                         then 'errCardClearUnsupported' else 'errNoCard' end;
        elsif card is not null and (card !~ '^\d{1,20}$'
               or (caps ? 'maxCardValue' and card::numeric > (caps ->> 'maxCardValue')::numeric)
               or not coalesce((caps ->> 'canWriteRfid')::boolean, false)) then
          reason := 'errInvalidCard';
        end if;
      end if;

      if reason is not null then
        if not existing_only or ep.id is not null then
          skipped := skipped || jsonb_build_object('personId', pid, 'machineId', mid, 'reason', reason);
        end if;
        continue;
      end if;
      if ep.id is null and existing_only then
        continue; -- a card change only updates machines the person is already on
      end if;

      desired_name := public._provision_device_name(full_name, (caps ->> 'maxNameLength')::integer,
                                                    coalesce((caps ->> 'supportsUnicodeNames')::boolean, false), uid::text);

      if ep.id is null then
        insert into attendance_machine_enrollments
          (school_id, machine_id, enroll_info_id, machine_user_id, entity_type, student_id, employee_id, desired_state, sync_state, desired_version)
        values
          (m.school_id, m.id, info.id, uid::text, entity_type,
           case when entity_type = 'student' then pid end, case when entity_type = 'employee' then pid end, 'present', 'pending', 1)
        returning * into ep;
        outcome := 'created';
      else
        if ep.last_command_id is not null then
          select * into open_cmd from machine_commands c where c.id = ep.last_command_id;
        end if;
        if ep.sync_state = 'synced'
           and public._provision_card_key(ep.last_synced_card, coalesce((caps ->> 'cardPreservesLeadingZeros')::boolean, true))
               is not distinct from public._provision_card_key(card, coalesce((caps ->> 'cardPreservesLeadingZeros')::boolean, true))
           and ep.last_synced_name is not distinct from desired_name then
          outcome := 'unchanged';
        elsif open_cmd.id is not null and open_cmd.status in ('pending', 'claimed', 'running')
              and (open_cmd.payload ->> 'desiredVersion')::integer = ep.desired_version
              and open_cmd.payload ->> 'card' is not distinct from card and open_cmd.payload ->> 'name' = desired_name then
          outcome := 'alreadyPending';
        else
          -- A superseded, not yet claimed command for this episode is cancelled; a claimed one finishes and is ignored.
          update machine_commands c
             set status = 'cancelled', completed_at = now(), error_detail = 'superseded by a newer desired version'
           where c.machine_id = m.id and c.type = 'PROVISION_PERSON' and c.status = 'pending'
             and c.payload ->> 'enrollmentRowId' = ep.id::text;
          update attendance_machine_enrollments e
             set desired_version = e.desired_version + 1, sync_state = 'pending', last_error = null
           where e.id = ep.id
          returning * into ep;
          outcome := case when ep.linked_at is not null then 'updated' else 'retried' end;
        end if;
      end if;

      if outcome in ('created', 'updated', 'retried') then
        version := ep.desired_version;
        insert into machine_commands (school_id, agent_id, machine_id, type, payload, idempotency_key, priority, max_attempts, created_by)
        values (m.school_id, m.agent_id, m.id, 'PROVISION_PERSON',
                jsonb_build_object('machineUserId', ep.machine_user_id, 'name', desired_name, 'card', card, 'privilege', 'user',
                                   'entityType', entity_type, 'enrollmentRowId', ep.id, 'desiredVersion', version),
                'provision:' || ep.id || ':' || version, 20, 3, auth.uid())
        on conflict (school_id, idempotency_key) do nothing
        returning id into cmd_id;
        if cmd_id is not null then
          update attendance_machine_enrollments e set last_command_id = cmd_id where e.id = ep.id;
        end if;
      end if;
      queued := queued || jsonb_build_object('personId', pid, 'machineId', mid, 'enrollmentId', ep.id,
                                             'desiredVersion', ep.desired_version, 'outcome', outcome);
    end loop;
  end loop;

  return jsonb_build_object('queued', queued, 'skipped', skipped);
end $$;

revoke execute on function public.enqueue_attendance_provisioning(text, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.enqueue_attendance_provisioning(text, uuid[], uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Results onto episodes. Only the command for the episode's CURRENT
-- desired_version counts; older versions, closed episodes and unknown
-- episodes are ignored. Success requires the Agent's read-back verification
-- (result.verified = true, same machine user ID); otherwise it is a failure.
create function public.machine_commands_provision_result() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ep attendance_machine_enrollments;
  verified boolean;
begin
  if new.type <> 'PROVISION_PERSON' or new.status is not distinct from old.status
     or coalesce(new.payload ->> 'enrollmentRowId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  select * into ep from attendance_machine_enrollments e where e.id = (new.payload ->> 'enrollmentRowId')::uuid for update;
  if ep.id is null or ep.unlinked_at is not null or ep.machine_id is distinct from new.machine_id
     or (new.payload ->> 'desiredVersion')::integer is distinct from ep.desired_version then
    return null;
  end if;

  if new.status in ('claimed', 'running') then
    update attendance_machine_enrollments e set sync_state = 'in_progress', last_command_id = new.id
     where e.id = ep.id and e.sync_state in ('pending', 'failed', 'drift');
  elsif new.status = 'succeeded' then
    verified := coalesce((new.result ->> 'verified')::boolean, false) and new.result ->> 'machineUserId' = ep.machine_user_id;
    if verified then
      update attendance_machine_enrollments e
         set sync_state = 'synced', linked_at = coalesce(e.linked_at, new.completed_at), synced_at = new.completed_at,
             last_synced_card = new.result ->> 'storedCard', last_synced_name = new.result ->> 'name',
             machine_internal_uid = case when new.result ->> 'internalUid' ~ '^\d{1,9}$' then (new.result ->> 'internalUid')::integer end,
             last_error = null, last_command_id = new.id
       where e.id = ep.id;
    else
      update attendance_machine_enrollments e
         set sync_state = 'failed', last_error = 'the device write was not verified by read-back', last_command_id = new.id
       where e.id = ep.id;
    end if;
  elsif new.status in ('failed', 'cancelled', 'expired') then
    update attendance_machine_enrollments e
       set sync_state = 'failed',
           last_error = left(coalesce(new.error_class || ': ', '') || coalesce(new.error_detail, new.status), 2000),
           last_command_id = new.id
     where e.id = ep.id;
  end if;
  return null;
end $$;

revoke execute on function public.machine_commands_provision_result() from public, anon, authenticated;

create trigger machine_commands_provision_result
  after update of status on public.machine_commands
  for each row execute function public.machine_commands_provision_result();
