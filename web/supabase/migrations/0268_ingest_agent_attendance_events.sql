-- Machine Attendance, Phase 8 (Architecture Baseline v1.1 §15, §21.3, §22.1;
-- ADR 0033): cloud ingestion of Attendance Agent events. FUNCTIONS ONLY: no
-- table, column, constraint, index, policy or data change. Phase 3 built the
-- storage (0218/0219 Agent columns, unique (machine_id, event_key)), the
-- School-local day and queue (0214/0215) and episode resolution (0263); 0221
-- the credential check. What was missing is the one writer the Baseline
-- reserves for Phase 8.
--
--   ingest_agent_attendance_events(credential, batch_id, events) -> jsonb
--     {accepted:[{machineId,eventKey}], duplicates:[…], rejected:[{machineId,eventKey,reason}]}
--
-- Authority. The Agent and its School come from the verified credential
-- (_attendance_agent_for_credential); nothing in the batch can name a School.
-- Every event's machine must be in that School AND assigned to that Agent.
--
-- Per event (one bad event never rejects the rest; reasons are stable codes):
--   INVALID_EVENT          shape: machineId uuid; machineUserId 1-64 chars,
--                          exactly as the device returned it; eventKey 1-128;
--                          deviceLocalTime zone-less "YYYY-MM-DDTHH:MM:SS[.f]";
--                          verifyMode 1-32 (required); punchState null or
--                          1-32; deviceRecordId null or 1-128; deviceSerial
--                          null or 1-128; raw null or a JSON object <= 16 KiB;
--                          deviceTimeZone null or text; eventTimeUtc null or
--                          an ISO instant WITH a zone/offset.
--   MACHINE_NOT_ASSIGNED   not this School's machine, or not assigned to this
--                          Agent (another Agent's, unassigned, foreign School).
--   NONEXISTENT_LOCAL_TIME / AMBIGUOUS_LOCAL_TIME
--                          the wall-clock time does not exist / exists twice
--                          in the machine's zone (DST); rejected, never
--                          guessed (Baseline §15.2.1). Asia/Dhaka has neither.
--   MACHINE_ARCHIVED       the punch is at or after the machine's archived_at
--                          (late events recorded BEFORE archiving are kept).
--   TIME_MISMATCH          the Agent's optional deviceTimeZone differs from the
--                          machine's zone, or its optional eventTimeUtc differs
--                          from the server conversion by 1 second or more.
--   EVENT_KEY_MISMATCH     the supplied eventKey is not the key the server
--                          recomputes (below). Never stored under another key.
-- A disabled (enabled = false) but assigned, non-archived machine is accepted:
-- disabling stops polling, it does not void punches already read.
--
-- Event key, recomputed (the Agent's EventKeys, pinned by its golden tests):
--   stable vendor record id (machine capabilities.attendanceHasStableRecordId
--   = true AND deviceRecordId given): sha256('rid|' || machine || '|' || record_id)
--   otherwise: sha256(machine || '|' || machine_user_id || '|' || second || '|'
--              || coalesce(punch_state,'') || '|' || coalesce(verify_mode,''))
--   machine = lower-case canonical uuid; second = the first 19 characters of
--   deviceLocalTime (whole seconds, truncated - exactly the Agent's
--   CanonicalKeySecond); lower-case hex. device_serial and raw never enter it.
--
-- Time, server-authoritative (Baseline §15.2.1, amended 2026-10-18):
--   tapped_at        = device_local_time at time zone attendance_machines.time_zone
--   device_time_zone = that machine zone (snapshot)
--   attendance_date  = (tapped_at at time zone schools.time_zone)::date
--   created_at       = receipt (column default)
-- The Agent's deviceTimeZone / eventTimeUtc are checks only, never stored.
--
-- Storage and idempotency: insert source = 'agent' rows; on conflict
-- (machine_id, event_key) do nothing — a replay never changes a stored event.
-- Enqueue: every (School, attendance_date) touched by an accepted OR duplicate
-- event is upserted to 'pending' (a duplicate re-pends its stored row's date),
-- so late, offline and resent batches always re-reconcile. Rejected events
-- touch nothing. Resolution to people stays in the queue drain (0263: through
-- enrollment episodes only; never by card, never by bare unique_id).
--
-- The two-argument reconcile_attendance (0267: ingest_token only) is not used.

-- ---------------------------------------------------------------------------
-- 1. The event key, exactly as the Agent computes it. Internal.
create function public._agent_event_key(
  machine uuid, machine_user_id text, local_second text, punch_state text, verify_mode text,
  record_id text, stable_record_id boolean)
returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(
    case when stable_record_id and record_id is not null
         then 'rid|' || lower(machine::text) || '|' || record_id
         else lower(machine::text) || '|' || machine_user_id || '|' || local_second || '|'
              || coalesce(punch_state, '') || '|' || coalesce(verify_mode, '')
    end, 'UTF8')), 'hex')
$$;

revoke execute on function public._agent_event_key(uuid, text, text, text, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The ingest.
create function public.ingest_agent_attendance_events(credential text, batch_id uuid, events jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a attendance_agents := public._attendance_agent_for_credential(credential);
  school_tz text;
  e jsonb;
  m attendance_machines;
  reason text;
  mid uuid;
  uid text;
  key text;
  local_text text;
  dlt timestamp;
  verify text;
  punch text;
  rid text;
  serial text;
  raw_meta jsonb;
  tz_claim text;
  utc_text text;
  utc_claim timestamptz;
  tapped timestamptz;
  att_date date;
  stored_id uuid;
  accepted jsonb := '[]'::jsonb;
  duplicates jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb;
  touched jsonb := '[]'::jsonb;
begin
  if batch_id is null or events is null or jsonb_typeof(events) <> 'array'
     or jsonb_array_length(events) not between 1 and 1000 or octet_length(events::text) > 4194304 then
    raise exception 'invalid attendance batch' using errcode = '22023';
  end if;
  select s.time_zone into school_tz from schools s where s.id = a.school_id;

  for e in select value from jsonb_array_elements(events) loop
    reason := null;
    mid := null;
    m := null;

    -- Shape.
    if jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'machineId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(e -> 'machineUserId') is distinct from 'string' or char_length(e ->> 'machineUserId') not between 1 and 64
       or jsonb_typeof(e -> 'eventKey') is distinct from 'string' or char_length(e ->> 'eventKey') not between 1 and 128
       or jsonb_typeof(e -> 'deviceLocalTime') is distinct from 'string'
       or (e ->> 'deviceLocalTime') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?$'
       or jsonb_typeof(e -> 'verifyMode') is distinct from 'string' or char_length(e ->> 'verifyMode') not between 1 and 32
       or coalesce(jsonb_typeof(e -> 'punchState'), 'null') not in ('null', 'string')
       or char_length(coalesce(e ->> 'punchState', 'x')) not between 1 and 32
       or coalesce(jsonb_typeof(e -> 'deviceRecordId'), 'null') not in ('null', 'string')
       or char_length(coalesce(e ->> 'deviceRecordId', 'x')) not between 1 and 128
       or coalesce(jsonb_typeof(e -> 'deviceSerial'), 'null') not in ('null', 'string')
       or char_length(coalesce(e ->> 'deviceSerial', 'x')) not between 1 and 128
       or coalesce(jsonb_typeof(e -> 'raw'), 'null') not in ('null', 'object')
       or octet_length(coalesce(e -> 'raw', 'null'::jsonb)::text) > 16384
       or coalesce(jsonb_typeof(e -> 'deviceTimeZone'), 'null') not in ('null', 'string')
       or char_length(coalesce(e ->> 'deviceTimeZone', 'x')) not between 1 and 64
       or coalesce(jsonb_typeof(e -> 'eventTimeUtc'), 'null') not in ('null', 'string')
       or coalesce(e ->> 'eventTimeUtc', '2000-01-01T00:00:00Z') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$' then
      reason := 'INVALID_EVENT';
    else
      mid := (e ->> 'machineId')::uuid;
      uid := e ->> 'machineUserId';
      key := e ->> 'eventKey';
      local_text := e ->> 'deviceLocalTime';
      verify := e ->> 'verifyMode';
      punch := e ->> 'punchState'; -- JSON null -> SQL null; an empty string was refused above
      rid := e ->> 'deviceRecordId';
      serial := e ->> 'deviceSerial';
      raw_meta := case when jsonb_typeof(e -> 'raw') = 'object' then e -> 'raw' end;
      tz_claim := e ->> 'deviceTimeZone';
      utc_text := e ->> 'eventTimeUtc';
      begin
        dlt := local_text::timestamp;
        utc_claim := utc_text::timestamptz;
      exception when others then
        reason := 'INVALID_EVENT';
      end;
    end if;

    -- The machine: this School's, assigned to this Agent.
    if reason is null then
      select * into m from attendance_machines am where am.id = mid and am.school_id = a.school_id and am.agent_id = a.id;
      if m.id is null then
        reason := 'MACHINE_NOT_ASSIGNED';
      end if;
    end if;

    -- Server-authoritative time in the machine's zone; DST gaps/overlaps are refused.
    if reason is null then
      tapped := dlt at time zone m.time_zone;
      if (tapped at time zone m.time_zone) <> dlt then
        reason := 'NONEXISTENT_LOCAL_TIME';
      elsif exists (select 1 from unnest(array[interval '30 minutes', interval '1 hour', interval '2 hours']) d
                     where ((tapped - d) at time zone m.time_zone) = dlt or ((tapped + d) at time zone m.time_zone) = dlt) then
        reason := 'AMBIGUOUS_LOCAL_TIME';
      elsif m.archived_at is not null and tapped >= m.archived_at then
        reason := 'MACHINE_ARCHIVED';
      elsif (tz_claim is not null and tz_claim <> m.time_zone)
         or (utc_claim is not null and abs(extract(epoch from (utc_claim - tapped))) >= 1) then
        reason := 'TIME_MISMATCH';
      elsif key <> public._agent_event_key(m.id, uid, left(local_text, 19), punch, verify, rid,
                                           coalesce((m.capabilities ->> 'attendanceHasStableRecordId')::boolean, false)) then
        reason := 'EVENT_KEY_MISMATCH';
      end if;
    end if;

    if reason is not null then
      rejected := rejected || jsonb_build_object('machineId', e ->> 'machineId', 'eventKey', e ->> 'eventKey', 'reason', reason);
      continue;
    end if;

    att_date := (tapped at time zone school_tz)::date;
    stored_id := null;
    insert into attendance_events
      (school_id, source, agent_id, machine_id, machine_user_id, event_key, tapped_at, attendance_date,
       device_local_time, device_time_zone, verify_mode, punch_state, device_serial, raw)
    values
      (a.school_id, 'agent', a.id, m.id, uid, key, tapped, att_date,
       dlt, m.time_zone, verify, punch, serial, raw_meta)
    on conflict (machine_id, event_key) where event_key is not null do nothing
    returning id into stored_id;

    if stored_id is not null then
      accepted := accepted || jsonb_build_object('machineId', m.id, 'eventKey', key);
    else
      -- Already stored: unchanged; re-pend the day it was stored under.
      select ae.attendance_date into att_date from attendance_events ae where ae.machine_id = m.id and ae.event_key = key;
      duplicates := duplicates || jsonb_build_object('machineId', m.id, 'eventKey', key);
    end if;
    touched := touched || jsonb_build_object('school_id', a.school_id, 'attendance_date', att_date);
  end loop;

  -- Distinct pairs only: the 0215 helper's own "distinct" includes clock_timestamp() and so cannot remove repeats.
  perform public._enqueue_attendance_reconcile_dates(coalesce((select jsonb_agg(distinct t) from jsonb_array_elements(touched) t), '[]'::jsonb));
  return jsonb_build_object('accepted', accepted, 'duplicates', duplicates, 'rejected', rejected);
end $$;

revoke execute on function public.ingest_agent_attendance_events(text, uuid, jsonb) from public;
grant execute on function public.ingest_agent_attendance_events(text, uuid, jsonb) to anon, authenticated;
