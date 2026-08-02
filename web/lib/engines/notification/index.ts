// Notification Engine — SEAM ONLY (map #258, implemented in #267).
// Event-driven, multi-channel, templated. Channels v1: in-app + SMS + email.
// Templates (bn/en) + per-event channel mapping are DB config. The SMS channel
// consumes the school SMS wallet (Financial/SMS Commerce).

export type NotificationChannel = 'in_app' | 'sms' | 'email'

export interface NotificationRequest {
  schoolId: string | null
  recipientId: string
  templateKey: string
  /** Values interpolated into the resolved bn/en template. */
  data: Record<string, unknown>
  /** Override the event->channel config mapping when needed. */
  channels?: NotificationChannel[]
}

export interface NotificationEngine {
  /** Resolve channel map + template and dispatch. */
  send(request: NotificationRequest): Promise<void>
}
