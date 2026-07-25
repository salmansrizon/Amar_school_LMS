import { describe, it, expect } from 'vitest'
import { buildReminderMessage, REMINDER_DAYS_BEFORE } from '@/lib/super-admin/expiry-reminder'

describe('buildReminderMessage', () => {
  it('names the school, the expiry date, and the 7-day window', () => {
    const msg = buildReminderMessage('Adarsha School', '2026-08-01')
    expect(msg).toContain('Adarsha School')
    expect(msg).toContain('2026-08-01')
    expect(msg).toContain(`${REMINDER_DAYS_BEFORE} days`)
  })
  it('reminder window is 7 days', () => {
    expect(REMINDER_DAYS_BEFORE).toBe(7)
  })
})
