-- Machine Attendance, Phase 3: forward follow-up to 0218 (owner review).
-- 0218 is already applied to the shared database; this changes only:
--
--   1. device_serial: nullable diagnostic snapshot of the serial the device
--      reported when the event was read. Not device identity (that is
--      machine_id), not a foreign key, not part of event_key or of any
--      uniqueness rule, never required.
--   2. attendance_events_agent_shape: punch_state is no longer required.
--      Some devices have no punch-state concept; absence is NULL, never a
--      placeholder such as '0' or 'none'. When present it keeps 0218's
--      1-32 character rule, so an empty string is still rejected.
--      verify_mode stays required.
--   3. attendance_events_legacy_shape: a legacy (ingest_token) row may not
--      carry device_serial either — it is Agent metadata.
--
-- Nothing else changes: source values, card_number, tapped_at,
-- attendance_date, the machine and Agent foreign keys, the unique
-- (machine_id, event_key) index, raw, RLS, grants, ingest_attendance_events
-- and the reconcile functions/triggers are untouched. Every existing row
-- satisfies the new checks (legacy rows have no device_serial; Agent rows
-- only lose a requirement).
--
-- Rule for the later Agent ingest (Phase 8), recorded here because 0218's
-- column comments describe the inputs. The server, not the Agent, decides
-- both times:
--     device_local_time + attendance_machines.time_zone  -> tapped_at (UTC)
--     tapped_at         + schools.time_zone              -> attendance_date
-- attendance_date is NOT simply device_local_time::date. Any zone or UTC
-- the Agent sends is checked against this, never stored as authoritative.

alter table public.attendance_events
  add column device_serial text
    constraint attendance_events_device_serial_shape check (device_serial is null or char_length(device_serial) between 1 and 128);

comment on column public.attendance_events.device_serial is
  'Agent events: the serial the device reported when read. Diagnostic snapshot only; not identity, not a key.';

alter table public.attendance_events
  drop constraint attendance_events_agent_shape,
  add constraint attendance_events_agent_shape check (
    source <> 'agent' or (
      machine_id is not null and machine_user_id is not null and agent_id is not null
      and event_key is not null and device_local_time is not null and device_time_zone is not null
      and verify_mode is not null
    )
  ),
  drop constraint attendance_events_legacy_shape,
  add constraint attendance_events_legacy_shape check (
    source <> 'ingest_token' or (
      card_number is not null
      and machine_id is null and agent_id is null and machine_user_id is null
      and event_key is null and device_local_time is null and device_time_zone is null
      and device_serial is null
    )
  );
