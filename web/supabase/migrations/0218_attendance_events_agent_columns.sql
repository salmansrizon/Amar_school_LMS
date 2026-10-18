-- Machine Attendance, Phase 3 (Architecture Baseline v1.1 §15.2, §15.3;
-- ADR 0033): attendance_events can hold Attendance Agent events next to the
-- legacy card taps. Expand-only and backward compatible:
--
--   * every new column is nullable, except `source`, whose default is the
--     legacy path, so the ingest RPC deployed on main (which names only
--     school_id, card_number, tapped_at, attendance_date) inserts exactly as
--     before and its rows are legacy rows;
--   * card_number stays required for legacy rows (by CHECK instead of NOT
--     NULL), because an Agent punch carries no card: TIMY attendance records
--     hold EnrollNumber and VerifyMode, not the RFID number (Phase 1A).
--
-- Nothing here resolves Agent events to people (that needs the enrollment
-- episodes, a later slice) and nothing writes Agent events: the Agent ingest
-- function is Phase 8. Access is unchanged: School members read and clean
-- their School's events, only Super Admin writes directly, and the legacy
-- ingest stays the only client-callable writer.
--
-- No trigger or function changes. Adding the columns rewrites no rows and
-- fires no trigger, so no reconcile pair is enqueued by this migration.

-- ---------------------------------------------------------------------------
-- 1. Columns.
alter table public.attendance_events
  -- 'ingest_token' = legacy device push / bridge upload (ADR 0001);
  -- 'agent' = the Windows Attendance Agent (ADR 0033). Baseline §15.2 names.
  add column source text not null default 'ingest_token'
    constraint attendance_events_source_valid check (source in ('ingest_token', 'agent')),
  -- The physical device that produced the punch, and the Agent that read it.
  add column machine_id uuid,
  add column agent_id uuid,
  -- The device user ID exactly as the device reported it (TIMY EnrollNumber).
  add column machine_user_id text
    constraint attendance_events_machine_user_id_shape check (machine_user_id is null or char_length(machine_user_id) between 1 and 64),
  -- Idempotency key, unique per machine: a machine-scoped vendor record ID or
  -- the Agent's deterministic fallback hash (Baseline §15.3). Not computed here.
  add column event_key text
    constraint attendance_events_event_key_shape check (event_key is null or char_length(event_key) between 1 and 128),
  -- Device wall-clock time, no zone or offset. The authoritative input for
  -- Agent events; the future ingest derives tapped_at from it server-side.
  add column device_local_time timestamp without time zone,
  -- The zone the server used for that conversion (the machine's), snapshotted.
  add column device_time_zone text
    constraint attendance_events_device_time_zone_valid check (device_time_zone is null or public.is_valid_time_zone(device_time_zone)),
  -- The device's own codes as strings (TIMY VerifyMode / InOutMode), per the
  -- Phase 2 driver contract (VerificationModeRaw / PunchState).
  add column verify_mode text
    constraint attendance_events_verify_mode_shape check (verify_mode is null or char_length(verify_mode) between 1 and 32),
  add column punch_state text
    constraint attendance_events_punch_state_shape check (punch_state is null or char_length(punch_state) between 1 and 32),
  -- Vendor diagnostics that are not part of the event key (e.g. TIMY Event).
  -- Never biometric data. A JSON object, bounded in size.
  add column raw jsonb
    constraint attendance_events_raw_shape check (raw is null or (jsonb_typeof(raw) = 'object' and octet_length(raw::text) <= 16384));

comment on column public.attendance_events.source is
  'ingest_token = legacy card tap (ADR 0001); agent = Windows Attendance Agent event (ADR 0033).';
comment on column public.attendance_events.device_local_time is
  'Agent events: the device''s wall-clock time, no zone. tapped_at is derived from it server-side.';
comment on column public.attendance_events.event_key is
  'Agent events: idempotency key, unique per machine (vendor record ID or deterministic fallback hash).';

-- ---------------------------------------------------------------------------
-- 2. card_number: required for legacy rows only.
alter table public.attendance_events alter column card_number drop not null;

-- ---------------------------------------------------------------------------
-- 3. Source-aware shape. A legacy row is a card tap and carries no Agent
-- identity; an Agent row carries the full device identity and time.
alter table public.attendance_events
  add constraint attendance_events_legacy_shape check (
    source <> 'ingest_token' or (
      card_number is not null
      and machine_id is null and agent_id is null and machine_user_id is null
      and event_key is null and device_local_time is null and device_time_zone is null
    )
  ),
  add constraint attendance_events_agent_shape check (
    source <> 'agent' or (
      machine_id is not null and machine_user_id is not null and agent_id is not null
      and event_key is not null and device_local_time is not null and device_time_zone is not null
      and verify_mode is not null and punch_state is not null
    )
  );

-- ---------------------------------------------------------------------------
-- 4. References. Same-School composite keys (0216/0217 added the targets).
-- Default NO ACTION: a machine or Agent with recorded events cannot be
-- deleted (they are archived / revoked instead), while deleting a whole
-- School still cascades through events, machines and Agents together.
alter table public.attendance_events
  add constraint attendance_events_machine_same_school
    foreign key (school_id, machine_id) references public.attendance_machines (school_id, id),
  add constraint attendance_events_agent_same_school
    foreign key (school_id, agent_id) references public.attendance_agents (school_id, id);

-- ---------------------------------------------------------------------------
-- 5. Idempotency: one event per (machine, event_key). The same key on two
-- different machines is two different events.
create unique index attendance_events_machine_event_key_key
  on public.attendance_events (machine_id, event_key)
  where event_key is not null;

-- Lookups by device (diagnostics, later resolution); the FK needs it too.
create index attendance_events_machine_idx
  on public.attendance_events (machine_id, device_local_time)
  where machine_id is not null;
create index attendance_events_agent_idx
  on public.attendance_events (agent_id)
  where agent_id is not null;
