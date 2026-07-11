// EmailGateway (Architecture §5 analog to SmsGateway): provider-agnostic
// interface for the Feedback Inbox's "reply by email" (issue #38). No email
// provider exists yet in this codebase, so — same call as the SMS gateway —
// nothing outside this module touches a provider directly, and the stored
// reply row (feedback_messages.reply_body) remains the source of truth
// regardless of whether the send itself succeeds.

export interface EmailResult {
  ok: boolean
  provider: string
  detail?: string
}

export interface EmailGateway {
  readonly name: string
  send(to: string, subject: string, body: string): Promise<EmailResult>
}

/** Records the send without dispatching — the default until a provider is configured. */
export class LogEmailProvider implements EmailGateway {
  readonly name = 'log'
  async send(): Promise<EmailResult> {
    return { ok: true, provider: this.name }
  }
}

/** Resend (resend.com) — activated purely by env configuration. */
export class ResendEmailProvider implements EmailGateway {
  readonly name = 'resend'
  constructor(
    private apiKey: string,
    private fromAddress: string,
  ) {}

  async send(to: string, subject: string, body: string): Promise<EmailResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.fromAddress, to, subject, text: body }),
    })
    const detail = await response.text()
    return { ok: response.ok, provider: this.name, detail }
  }
}

export function emailGateway(): EmailGateway {
  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_ADDRESS
  if (key && from) return new ResendEmailProvider(key, from)
  return new LogEmailProvider()
}
