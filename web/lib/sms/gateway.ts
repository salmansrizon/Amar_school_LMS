// SmsGateway (Architecture §5): provider-agnostic interface; mimsms stays the
// live default, but nothing outside this module touches a provider directly.
// LogSmsProvider is active until MIMSMS_API_KEY is configured (grill decision).

export interface SmsResult {
  ok: boolean
  provider: string
  detail?: string
}

export interface SmsGateway {
  readonly name: string
  send(phone: string, body: string): Promise<SmsResult>
}

/** Records the send without dispatching — the MVP default. */
export class LogSmsProvider implements SmsGateway {
  readonly name = 'log'
  async send(): Promise<SmsResult> {
    return { ok: true, provider: this.name }
  }
}

/** esms.mimsms.com — activated purely by env configuration. */
export class MimSmsProvider implements SmsGateway {
  readonly name = 'mimsms'
  constructor(
    private apiKey: string,
    private senderId: string,
  ) {}

  async send(phone: string, body: string): Promise<SmsResult> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      type: 'text',
      contacts: phone,
      senderid: this.senderId,
      msg: body,
    })
    const response = await fetch('https://esms.mimsms.com/smsapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const detail = await response.text()
    return { ok: response.ok, provider: this.name, detail }
  }
}

export function smsGateway(): SmsGateway {
  const key = process.env.MIMSMS_API_KEY
  const sender = process.env.MIMSMS_SENDER_ID
  if (key && sender) return new MimSmsProvider(key, sender)
  return new LogSmsProvider()
}