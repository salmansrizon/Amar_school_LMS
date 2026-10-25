-- Machine Attendance, Phase 6 (Architecture Baseline v1.1 §18.1, §21.3, §22;
-- ADR 0033): the definer RPCs behind /api/agent/v1 and the admin-side
-- activation / Test Connection / revocation. FUNCTIONS ONLY: no table, column,
-- constraint or policy changes. 0216 left the Agent writers ("activation,
-- rotation, heartbeat, revocation") to this phase; 0217 left the Agent-reported
-- machine columns to it; 0221 left command creation to each feature.
--
-- Agent-facing (anon-callable, credential-gated):
--   activate_attendance_agent            activation code + install identity + verifier
--   rotate_attendance_agent_credential   new verifier under the unchanged prefix
--   attendance_agent_heartbeat           health + liveness; returns config version
--   get_attendance_agent_config          enabled, non-archived machines of this Agent
--   report_attendance_device_probe       normalized DeviceInfo + capabilities + key yes/no
--   report_attendance_device_credential_status   key yes/no
-- Admin-facing (School session behind the Attendance grant, or Super Admin):
--   create_attendance_agent_activation_code      code shown once
--   request_attendance_machine_test              TEST_CONNECTION command
--   revoke_attendance_agent
--
-- Security rules (§18.1):
--   * The Agent's secret never reaches the database: activation carries
--     credential_hash = sha256(secret) (the "verifier"); later calls carry the
--     bearer agt_<prefix>_<secret>, hashed and compared by
--     _attendance_agent_for_credential (0221). Nothing here returns a hash or a
--     credential.
--   * School and Agent come from the verified credential, never from a
--     caller-supplied id. Every machine-scoped call checks the machine belongs
--     to the Agent's School AND is assigned to the Agent AND is not archived.
--   * No device communication key is accepted or returned; only the
--     credential_configured flag.
--   * Activation codes are stored as sha256 of the normalized code; the
--     plaintext is returned once by create_attendance_agent_activation_code.

-- ---------------------------------------------------------------------------
-- 1. Activation codes.

-- 12 characters from Crockford's alphabet (no I, L, O, U), shown as
-- XXXX-XXXX-XXXX; matching ignores case, spaces and hyphens. 60 random bits.
create function public._attendance_agent_code_normalize(code text) returns text
language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(code, ''), '[\s-]', '', 'g'))
$$;

create function public._attendance_agent_code_hash(code text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(public._attendance_agent_code_normalize(code), 'UTF8')), 'hex')
$$;

revoke execute on function public._attendance_agent_code_normalize(text) from public, anon, authenticated;
revoke execute on function public._attendance_agent_code_hash(text) from public, anon, authenticated;

create function public.create_attendance_agent_activation_code()
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  school uuid := public.app_current_school_id();
  raw bytea := uuid_send(gen_random_uuid());
  plain text := '';
  i integer;
  expiry timestamptz := now() + interval '24 hours';
begin
  if school is null or not public.app_module_granted('attendance') then
    raise exception 'not allowed to create an activation code' using errcode = '42501';
  end if;
  -- Bytes 0-5 and 10-15 of a v4 UUID are fully random; 256 % 32 = 0, so the
  -- modulo is unbiased.
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15] loop
    plain := plain || substr(alphabet, get_byte(raw, i) % 32 + 1, 1);
  end loop;
  insert into attendance_agent_activation_codes (school_id, code_hash, expires_at, created_by)
  values (school, public._attendance_agent_code_hash(plain), expiry, auth.uid());
  return query select substr(plain, 1, 4) || '-' || substr(plain, 5, 4) || '-' || substr(plain, 9, 4), expiry;
end $$;

revoke execute on function public.create_attendance_agent_activation_code() from public, anon;
grant execute on function public.create_attendance_agent_activation_code() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Activation (§18.1). Retry-safe:
--   * an Agent row with the same install_id, the same verifier, the same prefix
--     and the same activation code already exists -> that identity, unchanged
--     (the lost-response retry), even though the code is consumed or expired;
--   * same install_id otherwise -> 'agent installation conflict';
--   * code unknown / expired / revoked / consumed by another installation ->
--     'invalid activation code' (the same message for all, nothing to probe);
--   * prefix already used by another Agent -> 'credential prefix taken', BEFORE
--     the code is consumed, so the Agent may pick a new prefix and retry.
-- Never returns a credential or a hash.
create function public.activate_attendance_agent(
  code text, install_id uuid, credential_prefix text, credential_verifier text,
  hostname text default null, os_info text default null, agent_version text default null)
returns table (agent_id uuid, school_id uuid, school_name text)
language plpgsql security definer set search_path = public as $$
declare
  c attendance_agent_activation_codes;
  a attendance_agents;
  normalized text := public._attendance_agent_code_normalize(code);
begin
  if install_id is null or coalesce(credential_prefix, '') !~ '^[A-Za-z0-9]{8,32}$'
     or coalesce(credential_verifier, '') !~ '^[0-9a-f]{64}$'
     or char_length(coalesce(hostname, '')) > 255 or char_length(coalesce(os_info, '')) > 255
     or char_length(coalesce(agent_version, '')) > 64 then
    raise exception 'invalid activation request' using errcode = '22023';
  end if;
  if normalized !~ '^[0-9A-Z]{12}$' then
    raise exception 'invalid activation code' using errcode = '28000';
  end if;

  select * into c from attendance_agent_activation_codes ac
   where ac.code_hash = public._attendance_agent_code_hash(normalized) for update;
  select * into a from attendance_agents ag where ag.install_id = activate_attendance_agent.install_id for update;

  if a.id is not null then
    if a.status = 'active' and a.credential_hash = credential_verifier
       and a.credential_prefix = activate_attendance_agent.credential_prefix
       and c.id is not null and a.activation_code_id = c.id then
      return query select a.id, a.school_id, (select s.name from schools s where s.id = a.school_id);
      return;
    end if;
    if a.status = 'revoked' then
      raise exception 'invalid activation code' using errcode = '28000';
    end if;
    raise exception 'agent installation conflict' using errcode = '23505';
  end if;

  if c.id is null or c.revoked_at is not null or c.consumed_at is not null or c.expires_at <= now() then
    raise exception 'invalid activation code' using errcode = '28000';
  end if;
  if exists (select 1 from attendance_agents ag where ag.credential_prefix = activate_attendance_agent.credential_prefix) then
    raise exception 'credential prefix taken' using errcode = '23505';
  end if;

  insert into attendance_agents (school_id, name, hostname, install_id, credential_prefix, credential_hash,
                                 activation_code_id, os_info, agent_version, created_by)
  values (c.school_id, left(coalesce(nullif(btrim(hostname), ''), 'Attendance Agent'), 100), nullif(btrim(hostname), ''),
          activate_attendance_agent.install_id, activate_attendance_agent.credential_prefix, credential_verifier,
          c.id, nullif(btrim(os_info), ''), nullif(btrim(agent_version), ''), c.created_by)
  returning * into a;
  update attendance_agent_activation_codes ac set consumed_at = now(), consumed_by_agent_id = a.id where ac.id = c.id;
  return query select a.id, a.school_id, (select s.name from schools s where s.id = a.school_id);
end $$;

revoke execute on function public.activate_attendance_agent(text, uuid, text, text, text, text, text) from public;
grant execute on function public.activate_attendance_agent(text, uuid, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rotation (§18.1): a new verifier under the unchanged prefix. The current
-- hash becomes the previous one for a one-hour overlap. Repeating the same
-- new verifier is a no-op (lost-response retry, accepted with either secret);
-- a different new verifier during an overlap is refused.
create function public.rotate_attendance_agent_credential(credential text, new_verifier text)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  a attendance_agents := public._attendance_agent_for_credential(credential);
begin
  if coalesce(new_verifier, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid rotation request' using errcode = '22023';
  end if;
  if new_verifier = a.credential_hash then
    return a.previous_valid_until;
  end if;
  if a.previous_valid_until is not null and a.previous_valid_until > now() then
    raise exception 'credential rotation in progress' using errcode = '23505';
  end if;
  update attendance_agents ag
     set previous_credential_hash = ag.credential_hash, previous_valid_until = now() + interval '1 hour',
         credential_hash = new_verifier
   where ag.id = a.id
  returning ag.previous_valid_until into a.previous_valid_until;
  return a.previous_valid_until;
end $$;

revoke execute on function public.rotate_attendance_agent_credential(text, text) from public;
grant execute on function public.rotate_attendance_agent_credential(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Configuration (§12.3, §22.1 GET config): the machines this Agent serves.
-- Only enabled, non-archived machines assigned to this Agent in its School.
-- archivedDeviceIds lists this Agent's archived machines so it can wipe their
-- local keys (§12.3); a disabled machine is simply absent (its key is kept).
-- No device communication key exists in the database to include.
create function public._attendance_agent_config(a attendance_agents) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'agentId', a.id,
    'schoolId', a.school_id,
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'manufacturer', m.machine_type, 'model', m.model, 'serialNumber', m.serial_number,
               'location', m.location, 'host', m.host, 'port', m.port, 'driverKey', m.driver_key,
               'timeZone', m.time_zone, 'enabled', m.enabled) order by m.id)
        from attendance_machines m
       where m.agent_id = a.id and m.school_id = a.school_id and m.enabled and m.archived_at is null), '[]'::jsonb),
    'archivedDeviceIds', coalesce((
      select jsonb_agg(m.id order by m.id)
        from attendance_machines m
       where m.agent_id = a.id and m.school_id = a.school_id and m.archived_at is not null), '[]'::jsonb))
$$;

revoke execute on function public._attendance_agent_config(public.attendance_agents) from public, anon, authenticated;

create function public.get_attendance_agent_config(credential text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a attendance_agents := public._attendance_agent_for_credential(credential);
  config jsonb := public._attendance_agent_config(a);
begin
  return config || jsonb_build_object('configVersion', md5(config::text));
end $$;

revoke execute on function public.get_attendance_agent_config(text) from public;
grant execute on function public.get_attendance_agent_config(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Heartbeat (§19, §22.1): liveness and normalized health; returns the
-- config version so the Agent knows when to fetch config again.
create function public.attendance_agent_heartbeat(
  credential text, health jsonb default '{}'::jsonb, agent_version text default null,
  os_info text default null, hostname text default null)
returns table (agent_id uuid, server_time timestamptz, config_version text)
language plpgsql security definer set search_path = public as $$
declare
  a attendance_agents := public._attendance_agent_for_credential(credential);
begin
  if health is null or jsonb_typeof(health) <> 'object' or octet_length(health::text) > 65536
     or char_length(coalesce(agent_version, '')) > 64 or char_length(coalesce(os_info, '')) > 255
     or char_length(coalesce(hostname, '')) > 255 then
    raise exception 'invalid heartbeat' using errcode = '22023';
  end if;
  update attendance_agents ag
     set last_heartbeat_at = now(), last_health = health,
         agent_version = coalesce(nullif(btrim(attendance_agent_heartbeat.agent_version), ''), ag.agent_version),
         os_info = coalesce(nullif(btrim(attendance_agent_heartbeat.os_info), ''), ag.os_info),
         hostname = coalesce(nullif(btrim(attendance_agent_heartbeat.hostname), ''), ag.hostname)
   where ag.id = a.id;
  return query select a.id, now(), md5(public._attendance_agent_config(a)::text);
end $$;

revoke execute on function public.attendance_agent_heartbeat(text, jsonb, text, text, text) from public;
grant execute on function public.attendance_agent_heartbeat(text, jsonb, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Device reports. The machine must be this Agent's, in its School, and not
-- archived. Writes only the Agent-reported columns 0217 reserved for this.
create function public._attendance_agent_machine(a attendance_agents, target uuid)
returns attendance_machines
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines;
begin
  select * into m from attendance_machines am
   where am.id = target and am.school_id = a.school_id and am.agent_id = a.id for update;
  if m.id is null or m.archived_at is not null then
    raise exception 'attendance machine not found' using errcode = 'P0002';
  end if;
  return m;
end $$;

revoke execute on function public._attendance_agent_machine(public.attendance_agents, uuid) from public, anon, authenticated;

-- Probe result: normalized DeviceInfo + DeviceCapabilities (as the Agent's
-- driver contract defines them) and whether a key is configured locally.
-- Serial rule (0217): probed_serial is set once, and only when the device
-- reports the serial the School registered (case-insensitive). Returns
-- 'verified' | 'serial_mismatch' | 'no_serial'.
create function public.report_attendance_device_probe(
  credential text, machine_id uuid, info jsonb, capabilities jsonb, credential_configured boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  a attendance_agents := public._attendance_agent_for_credential(credential);
  m attendance_machines := public._attendance_agent_machine(a, machine_id);
  serial text;
  pin integer;
  pinned text;
  outcome text := 'no_serial';
begin
  if info is null or jsonb_typeof(info) <> 'object' or octet_length(info::text) > 16384
     or capabilities is null or jsonb_typeof(capabilities) <> 'object' or octet_length(capabilities::text) > 16384
     or credential_configured is null then
    raise exception 'invalid probe report' using errcode = '22023';
  end if;
  serial := nullif(btrim(info->>'serialNumber'), '');
  pin := case when (info->>'pinWidth') ~ '^\d{1,2}$' and (info->>'pinWidth')::integer between 1 and 32
              then (info->>'pinWidth')::integer end;
  pinned := case when m.driver_key = 'auto' and (info->>'driverKey') ~ '^[a-z0-9][a-z0-9-]{0,63}$'
                 then info->>'driverKey' else m.driver_key end;

  if serial is not null then
    if m.probed_serial is not null then
      outcome := case when lower(m.probed_serial) = lower(serial) then 'verified' else 'serial_mismatch' end;
    elsif lower(btrim(m.serial_number)) = lower(serial) then
      outcome := 'verified';
    else
      outcome := 'serial_mismatch';
    end if;
  end if;

  update attendance_machines am
     set firmware_version = left(nullif(btrim(info->>'firmwareVersion'), ''), 128),
         platform = left(nullif(btrim(info->>'platform'), ''), 128),
         device_name = left(nullif(btrim(info->>'deviceName'), ''), 128),
         mac = left(nullif(btrim(info->>'mac'), ''), 64),
         pin_width = pin,
         capabilities = report_attendance_device_probe.capabilities,
         credential_configured = report_attendance_device_probe.credential_configured,
         credential_reported_at = now(),
         driver_key = pinned,
         probed_serial = case when am.probed_serial is null and outcome = 'verified' then serial else am.probed_serial end,
         serial_verified_at = case when am.probed_serial is null and outcome = 'verified' then now() else am.serial_verified_at end
   where am.id = m.id;
  return outcome;
end $$;

revoke execute on function public.report_attendance_device_probe(text, uuid, jsonb, jsonb, boolean) from public;
grant execute on function public.report_attendance_device_probe(text, uuid, jsonb, jsonb, boolean) to anon, authenticated;

-- Key yes/no, sent when the operator sets or clears a key in the local config tool.
create function public.report_attendance_device_credential_status(credential text, machine_id uuid, credential_configured boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a attendance_agents := public._attendance_agent_for_credential(credential);
  m attendance_machines := public._attendance_agent_machine(a, machine_id);
begin
  if credential_configured is null then
    raise exception 'invalid credential status' using errcode = '22023';
  end if;
  update attendance_machines am
     set credential_configured = report_attendance_device_credential_status.credential_configured,
         credential_reported_at = now()
   where am.id = m.id;
end $$;

revoke execute on function public.report_attendance_device_credential_status(text, uuid, boolean) from public;
grant execute on function public.report_attendance_device_credential_status(text, uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Test Connection (§16, §22.2): one TEST_CONNECTION command through the
-- machine_commands queue; an open one for the same machine is reused. The
-- machine must be in service (enabled, not archived) with an active Agent.
create function public.request_attendance_machine_test(machine_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m attendance_machines := public._attendance_machine_for_caller(machine_id);
  existing uuid;
  created uuid;
begin
  if m.archived_at is not null or not m.enabled then
    raise exception 'attendance machine is not in service' using errcode = '22023';
  end if;
  if m.agent_id is null or not exists (select 1 from attendance_agents ag where ag.id = m.agent_id and ag.status = 'active') then
    raise exception 'attendance machine has no active agent' using errcode = '22023';
  end if;
  select c.id into existing from machine_commands c
   where c.machine_id = m.id and c.type = 'TEST_CONNECTION' and c.status in ('pending', 'claimed', 'running')
   order by c.created_at desc limit 1;
  if existing is not null then
    return existing;
  end if;
  insert into machine_commands (school_id, agent_id, machine_id, type, payload, idempotency_key, priority, max_attempts, created_by)
  values (m.school_id, m.agent_id, m.id, 'TEST_CONNECTION', '{}'::jsonb, 'test:' || m.id || ':' || gen_random_uuid(), 50, 1, auth.uid())
  returning id into created;
  return created;
end $$;

revoke execute on function public.request_attendance_machine_test(uuid) from public, anon;
grant execute on function public.request_attendance_machine_test(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Revocation (§18.1, §22.2): the credential stops working at once
-- (_attendance_agent_for_credential refuses revoked Agents), its machines in
-- service are unassigned, its unfinished commands are cancelled. One-way.
create function public.revoke_attendance_agent(agent_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a attendance_agents;
begin
  select * into a from attendance_agents ag where ag.id = revoke_attendance_agent.agent_id for update;
  if a.id is null
     or not (public.app_current_role() = 'super_admin'
             or (a.school_id = public.app_current_school_id() and public.app_module_granted('attendance'))) then
    raise exception 'attendance agent not found' using errcode = 'P0002';
  end if;
  if a.status = 'revoked' then
    return;
  end if;
  update attendance_agents ag set status = 'revoked', revoked_at = now(), revoked_by = auth.uid() where ag.id = a.id;
  update machine_commands c
     set status = 'cancelled', completed_at = now(), error_detail = 'attendance agent revoked',
         claim_token = null, lease_expires_at = null
   where c.agent_id = a.id and c.status in ('pending', 'claimed', 'running');
  -- Archived machines are frozen (0217) and keep their history; they are already out of every config.
  update attendance_machines am set agent_id = null where am.agent_id = a.id and am.archived_at is null;
end $$;

revoke execute on function public.revoke_attendance_agent(uuid) from public, anon;
grant execute on function public.revoke_attendance_agent(uuid) to authenticated;
