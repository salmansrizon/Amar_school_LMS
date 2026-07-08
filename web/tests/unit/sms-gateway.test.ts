import { describe, it, expect } from 'vitest'
import { LogSmsProvider, MimSmsProvider, smsGateway } from '@/lib/sms/gateway'

// Acceptance (issue #12): SMS goes through the SmsGateway interface — a
// provider swap must not touch rule-evaluation code. We prove the swap is
// purely environmental.
describe('smsGateway resolution', () => {
  it('defaults to the log provider when mimsms is not configured', () => {
    delete process.env.MIMSMS_API_KEY
    delete process.env.MIMSMS_SENDER_ID
    expect(smsGateway()).toBeInstanceOf(LogSmsProvider)
  })

  it('activates mimsms purely via env configuration', () => {
    process.env.MIMSMS_API_KEY = 'k'
    process.env.MIMSMS_SENDER_ID = 's'
    expect(smsGateway()).toBeInstanceOf(MimSmsProvider)
    delete process.env.MIMSMS_API_KEY
    delete process.env.MIMSMS_SENDER_ID
  })

  it('the log provider reports success without dispatching', async () => {
    const result = await new LogSmsProvider().send()
    expect(result).toEqual({ ok: true, provider: 'log' })
  })

  it('both providers satisfy the same interface (swap point)', () => {
    const providers = [new LogSmsProvider(), new MimSmsProvider('k', 's')]
    for (const p of providers) {
      expect(typeof p.send).toBe('function')
      expect(typeof p.name).toBe('string')
    }
  })
})