import { t, type Lang, type MessageKey } from '@/lib/i18n'

// Shared by OfficeHourForm and OfficeHourCell: both display errors returned
// by actions.ts, which return short codes (matching the ERROR_KEYS pattern
// already used by web/app/school/institute/venues/venue-controls.tsx) rather
// than raw Postgres/validation text, so both call sites need the same
// code -> translated-message mapping.
const ERROR_KEYS: Record<string, MessageKey> = {
  errTimeRequired: 'officeHour.errTimeRequired',
  errEndBeforeStart: 'officeHour.errEndBeforeStart',
  errNoSelection: 'officeHour.errNoSelection',
  errInvalidShift: 'officeHour.errInvalidShift',
  errInvalidCategory: 'officeHour.errInvalidCategory',
  errDuplicate: 'officeHour.errDuplicate',
  errNotFound: 'officeHour.errNotFound',
}

/** A recognized code is translated; anything else (an unmapped Postgres
 *  message) is shown as-is rather than crashing on an unknown dict key. */
export function officeHourErrorMessage(error: string, lang: Lang): string {
  return error in ERROR_KEYS ? t(ERROR_KEYS[error]!, lang) : error
}
