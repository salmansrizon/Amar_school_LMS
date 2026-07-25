// Subscription expiry reminder (map #158, ticket #163). Pure message builder so
// the cron route's SMS + activity-row copy is unit-testable, and the reminder
// window lives in one place.

/** How many days before expiry the sweep warns the owner. */
export const REMINDER_DAYS_BEFORE = 7

/** SMS + activity-feed body for the 7-day expiry reminder. */
export function buildReminderMessage(schoolName: string, expiresOn: string): string {
  return `${schoolName}: your Amar School subscription expires on ${expiresOn} (in ${REMINDER_DAYS_BEFORE} days). Please renew to avoid interruption.`
}

/** Activity-feed notice title for the reminder. */
export const REMINDER_TITLE = 'Subscription expiring soon'
