// Event → notification mapping for the deferred #267 cutover (#271). The absence
// and expiry sweeps publish domain events; these pure builders turn a payload
// into a NotificationRequest (per-event recipient + template resolution) so the
// originating job never names a channel. The SMS channel stays deferred in the
// engine, so absence (guardian phone, not an app user) keeps its own dispatch
// while its event is emitted for the future SMS consumer + audit trail.
import type { NotificationRequest } from './index'

export interface SubscriptionExpiringSoonPayload {
  schoolId: string
  ownerId: string
  schoolName: string
  expiresOn: string
}

export interface StudentAbsenceStreakPayload {
  schoolId: string
  studentId: string
  studentName: string
  guardianPhone: string | null
  streak: number
}

/** Resolve the owner-facing in-app notice for an imminent subscription lapse. */
export function expiringSoonNotification(payload: SubscriptionExpiringSoonPayload): NotificationRequest {
  return {
    schoolId: payload.schoolId,
    recipientId: payload.ownerId,
    templateKey: 'subscription_expiring',
    data: { school: payload.schoolName, expiresOn: payload.expiresOn },
    channels: ['in_app'],
  }
}

/** Guardian SMS copy for an absence streak — the exact message the absence job
 *  has always sent, extracted so the route and any future SMS-channel consumer
 *  share one source. */
export function absenceStreakBody(studentName: string, streak: number): string {
  return `${studentName} has been absent for ${streak} working day(s).`
}
