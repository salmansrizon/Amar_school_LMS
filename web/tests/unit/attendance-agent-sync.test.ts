import { describe, it, expect } from 'vitest'
import { agentNotSyncedFor } from '@/lib/school/attendance-agent-sync'

describe('agentNotSyncedFor (#694)', () => {
  it('unknown heartbeat never warns', () => {
    expect(agentNotSyncedFor('2026-10-07', null)).toBe(false)
    expect(agentNotSyncedFor('2026-10-07', 'not a date')).toBe(false)
  })
  it('warns when the last heartbeat is on an earlier School day', () => {
    expect(agentNotSyncedFor('2026-10-07', '2026-10-06T10:00:00Z')).toBe(true)
  })
  it('does not warn when the Agent reported on or after that day', () => {
    expect(agentNotSyncedFor('2026-10-07', '2026-10-07T03:00:00Z')).toBe(false)
    expect(agentNotSyncedFor('2026-10-05', '2026-10-07T03:00:00Z')).toBe(false)
  })
  it('uses the School day (Asia/Dhaka), not the UTC day', () => {
    // 19:30 UTC on the 6th is 01:30 on the 7th in Dhaka.
    expect(agentNotSyncedFor('2026-10-07', '2026-10-06T19:30:00Z')).toBe(false)
  })
})
