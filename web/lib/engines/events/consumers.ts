// Central registration point for in-process domain-event consumers (map #258).
// Importing this module wires every consumer into the registry; the publish
// path and the cron drain both import it so consumers are present in either
// execution context. Later engine phases add their subscriptions here:
//   #261 Audit  -> audit every business event
//   #267 Notification -> route events to channels
import { registerAuditConsumers } from '@/lib/engines/audit/consumers'
import { subscribe } from './registry'

// Proof consumer (#260): SchoolCreated has one no-op subscriber so the sync
// dispatch + outbox drain paths are exercised end-to-end before any real
// consumer exists. Idempotent by construction (does nothing).
subscribe('SchoolCreated', async () => {})

// #261 Audit: record every domain event to the immutable audit log.
registerAuditConsumers()

export {}
