-- Machine Attendance, Phase 3 (Architecture Baseline v1.1 §12.4, §12.7, §16,
-- §18.1, §21.2-21.3; ADR 0033; Wayfinder §4.7): machine_commands, the work
-- the cloud asks one Attendance Agent to do, plus the two Agent-facing
-- functions that claim and complete it. Expand-only: new table, new
-- functions; nothing existing changes.
--
--   machine_commands                   one row per command
--   _attendance_agent_for_credential   verifies an Agent bearer credential
--   claim_machine_commands             Agent: lease up to N due commands
--   complete_machine_command           Agent: report a claimed command's outcome
--
-- Creating commands is NOT here: each feature that needs one (Test Connection,
-- provisioning, ...) adds its own definer function in its phase, building the
-- payload server-side. Until then only Super Admin can insert (maintenance and
-- test fixtures). School users can read their School's commands (status
-- display) and write nothing.
--
-- Agent credential (Baseline §18.1): the Agent sends
--   agt_<credential_prefix>_<secret>
-- (the route strips "Bearer "). The secret is never stored; the database holds
-- credential_hash = lower-case hex SHA-256 of the secret's UTF-8 bytes, which
-- is exactly the credentialVerifier the Agent sends at activation. During a
-- rotation overlap the previous hash is accepted until previous_valid_until.
-- A revoked Agent is refused. Every failure raises the same error.
--
-- Lifecycle (§16): pending -> claimed -> succeeded | failed, with
--   * a lease: a claim is valid until lease_expires_at; an expired claim is
--     due again (new claim_token) while attempts < max_attempts, and fails
--     (error_class 'timeout') once the attempts are used up (Baseline §12.7);
--   * results accepted once per (command id, claim_token); a repeat of the
--     same result is acknowledged, anything else from an old claim is stale;
--   * 'running' (progress, e.g. fingerprint enrollment), 'cancelled'
--     (archive/cancel flows) and 'expired' (§16) are valid states whose
--     writers come later.

-- ---------------------------------------------------------------------------
-- 1. Table.
create table public.machine_commands (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  agent_id uuid not null,
  -- Null only for Agent-wide commands (REFRESH_CONFIG).
  machine_id uuid,
  type text not null check (type in (
    'PROBE_DEVICE', 'TEST_CONNECTION', 'READ_DEVICE_INFO', 'SYNC_TIME', 'PROVISION_PERSON',
    'REMOVE_PERSON', 'READ_USERS', 'PULL_ATTENDANCE_NOW', 'START_FINGERPRINT_ENROLLMENT', 'REFRESH_CONFIG')),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'running', 'succeeded', 'failed', 'cancelled', 'expired')),
  -- e.g. provision:{enrollment_row_id}:{desired_version}; unique per School.
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  -- Higher runs first (§12.4: interactive > provisioning > pulls > reconciliation reads).
  priority smallint not null default 0 check (priority between -100 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  claim_token uuid,
  lease_expires_at timestamptz,
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 65536)),
  -- A normalized DeviceErrorClass (Phase 2 driver contract), as the bridge protocol spells it.
  error_class text check (error_class is null or error_class in (
    'unreachable', 'authFailed', 'timeout', 'busy', 'notSupported', 'capacityFull',
    'invalidData', 'vendorError', 'driverUnavailable')),
  error_detail text check (char_length(error_detail) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint machine_commands_idempotency_unique unique (school_id, idempotency_key),
  -- Same-School references. Agents are revoked, never deleted (NO ACTION).
  -- A machine's commands go with it: only a never-used machine can be
  -- deleted, and the delete function for those comes later (Baseline §17.4).
  constraint machine_commands_agent_same_school
    foreign key (school_id, agent_id) references public.attendance_agents (school_id, id),
  constraint machine_commands_machine_same_school
    foreign key (school_id, machine_id) references public.attendance_machines (school_id, id) on delete cascade,
  constraint machine_commands_machine_required
    check (machine_id is not null or type = 'REFRESH_CONFIG'),
  -- State shape.
  constraint machine_commands_claim_shape check (
    status not in ('claimed', 'running') or (claim_token is not null and lease_expires_at is not null and claimed_at is not null)
  ),
  constraint machine_commands_completion_shape check (
    status not in ('succeeded', 'failed', 'cancelled', 'expired') or completed_at is not null
  ),
  constraint machine_commands_failure_has_class check (status <> 'failed' or error_class is not null)
);

comment on table public.machine_commands is
  'Work for one Attendance Agent (ADR 0033). Claimed and completed only through claim_machine_commands / complete_machine_command.';

-- Claim order for one Agent.
create index machine_commands_claim_idx
  on public.machine_commands (agent_id, status, priority desc, created_at);
create index machine_commands_machine_idx
  on public.machine_commands (machine_id) where machine_id is not null;
create index machine_commands_school_status_idx
  on public.machine_commands (school_id, status, created_at);

-- ---------------------------------------------------------------------------
-- 2. Guard. On insert: the machine must be assigned to the command's Agent
-- (§18.1). On update: what a command is (School, Agent, machine, type,
-- payload, key, creation) never changes, and a finished command stays
-- finished.
create function public.machine_commands_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.machine_id is not null and not exists (
         select 1 from attendance_machines m where m.id = new.machine_id and m.agent_id = new.agent_id) then
      raise exception 'a machine command must target a machine assigned to its Attendance Agent';
    end if;
    return new;
  end if;

  if new.school_id is distinct from old.school_id or new.agent_id is distinct from old.agent_id
     or new.machine_id is distinct from old.machine_id or new.type is distinct from old.type
     or new.payload is distinct from old.payload or new.idempotency_key is distinct from old.idempotency_key
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'a machine command''s target, type, payload and key are immutable';
  end if;
  if old.status in ('succeeded', 'failed', 'cancelled', 'expired') and (
       new.status is distinct from old.status or new.result is distinct from old.result
       or new.error_class is distinct from old.error_class or new.error_detail is distinct from old.error_detail
       or new.completed_at is distinct from old.completed_at or new.claim_token is distinct from old.claim_token) then
    raise exception 'a finished machine command cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger machine_commands_guard
  before insert or update on public.machine_commands
  for each row execute function public.machine_commands_guard();

-- ---------------------------------------------------------------------------
-- 3. Agent credential verification (shared by every future Agent function).
create function public._attendance_agent_for_credential(credential text)
returns public.attendance_agents
language plpgsql security definer set search_path = public as $$
declare
  parts text[];
  a attendance_agents;
  presented text;
begin
  parts := regexp_match(coalesce(credential, ''), '^agt_([A-Za-z0-9]{8,32})_(\S{16,255})$');
  if parts is null then
    raise exception 'invalid agent credential' using errcode = '28000';
  end if;
  select * into a from attendance_agents where credential_prefix = parts[1];
  presented := encode(sha256(convert_to(parts[2], 'UTF8')), 'hex');
  if a.id is null or a.status <> 'active' or not (
       presented = a.credential_hash
       or (a.previous_credential_hash is not null and presented = a.previous_credential_hash
           and a.previous_valid_until > now())) then
    raise exception 'invalid agent credential' using errcode = '28000';
  end if;
  return a;
end $$;

revoke execute on function public._attendance_agent_for_credential(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Claim. Leases up to max_commands due commands of the calling Agent,
-- highest priority first, oldest first. Due = pending, or claimed/running
-- with an expired lease and attempts left. Commands whose machine is
-- archived, disabled or no longer assigned to this Agent are not handed out.
-- Commands whose lease expired with no attempts left fail first.
create function public.claim_machine_commands(credential text, max_commands integer default 10)
returns table (
  id uuid, machine_id uuid, type text, payload jsonb, idempotency_key text, priority smallint,
  attempts integer, max_attempts integer, claim_token uuid, lease_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  a attendance_agents := public._attendance_agent_for_credential(credential);
begin
  if max_commands is null or max_commands < 1 or max_commands > 100 then
    raise exception 'max_commands must be between 1 and 100';
  end if;

  -- Baseline §12.7: an expired lease returns the command to the queue while
  -- attempts remain; otherwise the command fails. The lease and token are
  -- cleared, so a late report from that last claim is stale.
  update machine_commands c
     set status = 'failed', completed_at = now(), error_class = 'timeout',
         error_detail = format('lease expired after %s of %s attempts', c.attempts, c.max_attempts),
         claim_token = null, lease_expires_at = null
   where c.agent_id = a.id
     and c.status in ('claimed', 'running')
     and c.lease_expires_at < now()
     and c.attempts >= c.max_attempts;

  return query
  with due as (
    select c.id
      from machine_commands c
      left join attendance_machines m on m.id = c.machine_id
     where c.agent_id = a.id
       and (c.status = 'pending'
            or (c.status in ('claimed', 'running') and c.lease_expires_at < now() and c.attempts < c.max_attempts))
       and (c.machine_id is null or (m.agent_id = a.id and m.enabled and m.archived_at is null))
     order by c.priority desc, c.created_at
     limit max_commands
       for update of c skip locked
  )
  update machine_commands c
     set status = 'claimed', claim_token = gen_random_uuid(), attempts = c.attempts + 1,
         claimed_at = now(), lease_expires_at = now() + interval '10 minutes'
    from due
   where c.id = due.id
  returning c.id, c.machine_id, c.type, c.payload, c.idempotency_key, c.priority,
            c.attempts, c.max_attempts, c.claim_token, c.lease_expires_at;
end $$;

revoke execute on function public.claim_machine_commands(text, integer) from public;
grant execute on function public.claim_machine_commands(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Complete. The Agent reports 'succeeded' or 'failed' for a command it
-- claimed, quoting the claim_token. Returns:
--   'completed'          the outcome was recorded
--   'already_completed'  the same claim already reported this same outcome
--   'stale'              the claim is no longer current (re-claimed, expired,
--                        cancelled) or a different outcome was already
--                        recorded; nothing changes
-- A command of another Agent (or no such command) is an error.
create function public.complete_machine_command(
  credential text, command_id uuid, claim_token uuid, status text,
  result jsonb default null, error_class text default null, error_detail text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  a attendance_agents := public._attendance_agent_for_credential(credential);
  c machine_commands;
begin
  if status not in ('succeeded', 'failed') then
    raise exception 'status must be succeeded or failed';
  end if;
  select * into c from machine_commands mc where mc.id = command_id and mc.agent_id = a.id for update;
  if c.id is null then
    raise exception 'machine command not found' using errcode = 'P0002';
  end if;
  if c.claim_token is distinct from complete_machine_command.claim_token then
    return 'stale';
  end if;
  if c.status in ('succeeded', 'failed') then
    return case when c.status = complete_machine_command.status then 'already_completed' else 'stale' end;
  end if;
  if c.status not in ('claimed', 'running') then
    return 'stale';
  end if;
  update machine_commands mc
     set status = complete_machine_command.status,
         result = complete_machine_command.result,
         error_class = case when complete_machine_command.status = 'failed' then complete_machine_command.error_class end,
         error_detail = complete_machine_command.error_detail,
         completed_at = now()
   where mc.id = c.id;
  return 'completed';
end $$;

revoke execute on function public.complete_machine_command(text, uuid, uuid, text, jsonb, text, text) from public;
grant execute on function public.complete_machine_command(text, uuid, uuid, text, jsonb, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Access. Read: the School's members behind the Attendance grant, and
-- Super Admin. Write: Super Admin only (until each feature's creation
-- function exists); the Agent writes only through the functions above. No
-- application role deletes a command.
revoke all on public.machine_commands from anon, authenticated;
grant select, insert, update on public.machine_commands to authenticated;

alter table public.machine_commands enable row level security;

create policy "school members read machine commands" on public.machine_commands
  for select
  using (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')));
create policy "super admin reads machine commands" on public.machine_commands
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin inserts machine commands" on public.machine_commands
  for insert with check (public.app_current_role() = 'super_admin');
create policy "super admin updates machine commands" on public.machine_commands
  for update
  using (public.app_current_role() = 'super_admin')
  with check (public.app_current_role() = 'super_admin');
