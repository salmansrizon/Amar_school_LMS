import { describe, it, expect } from 'vitest'
import { LogEmailProvider, ResendEmailProvider, emailGateway } from '@/lib/email/gateway'

// EmailGateway (issue #38): the Feedback Inbox's "reply by email" needs an
// outbound send, but no email provider exists yet in this codebase. Mirrors
// SmsGateway's provider-agnostic shape exactly (Architecture doc) — default
// to a no-op log provider until a real provider is configured by env only.
describe('emailGateway resolution', () => {
  it('defaults to the log provider when no provider is configured', () => {
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM_ADDRESS
    expect(emailGateway()).toBeInstanceOf(LogEmailProvider)
  })

  it('activates Resend purely via env configuration', () => {
    process.env.RESEND_API_KEY = 'k'
    process.env.RESEND_FROM_ADDRESS = 'school@example.com'
    expect(emailGateway()).toBeInstanceOf(ResendEmailProvider)
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM_ADDRESS
  })

  it('the log provider reports success without dispatching', async () => {
    const result = await new LogEmailProvider().send()
    expect(result).toEqual({ ok: true, provider: 'log' })
  })

  it('both providers satisfy the same interface (swap point)', () => {
    const providers = [new LogEmailProvider(), new ResendEmailProvider('k', 'school@example.com')]
    for (const p of providers) {
      expect(typeof p.send).toBe('function')
      expect(typeof p.name).toBe('string')
    }
  })
})
