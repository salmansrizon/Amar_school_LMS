import { describe, it, expect } from 'vitest'
import {
  expiringSoonNotification,
  absenceStreakBody,
} from '@/lib/engines/notification/events'

describe('expiringSoonNotification', () => {
  it('resolves the owner as recipient and routes to the expiry template', () => {
    const req = expiringSoonNotification({
      schoolId: 'school-1',
      ownerId: 'owner-1',
      schoolName: 'Sunrise Academy',
      expiresOn: '2026-09-01',
    })
    expect(req.recipientId).toBe('owner-1')
    expect(req.schoolId).toBe('school-1')
    expect(req.templateKey).toBe('subscription_expiring')
    expect(req.channels).toEqual(['in_app'])
    expect(req.data).toEqual({ school: 'Sunrise Academy', expiresOn: '2026-09-01' })
  })
})

describe('absenceStreakBody', () => {
  it('reads as the guardian SMS the absence job has always sent', () => {
    expect(absenceStreakBody('Rahim', 3)).toBe('Rahim has been absent for 3 working day(s).')
  })

  it('is singular-safe (copy unchanged: always "day(s)")', () => {
    expect(absenceStreakBody('Karim', 1)).toBe('Karim has been absent for 1 working day(s).')
  })
})
