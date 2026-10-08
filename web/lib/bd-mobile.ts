// Bangladeshi mobile numbers (01[3-9]########) and Bangla-digit handling, shared
// by the student admission/edit and employee create/edit actions, the directory
// searches and the form inputs.

const BN_DIGITS = '০১২৩৪৫৬৭৮৯'

/** Bangla digits → Latin, everything else untouched. */
export function toLatinDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
}

/** The canonical 11-digit `01XXXXXXXXX`, or null when `raw` isn't a valid
 *  Bangladeshi mobile. Accepts Bangla digits, spaces/dashes and a +880 / 880
 *  prefix (normalised to the leading 0). */
export function normalizeBdMobile(raw: string): string | null {
  let s = toLatinDigits(raw).replace(/[\s\-().]/g, '')
  if (s.startsWith('+880')) s = `0${s.slice(4)}`
  else if (s.startsWith('880')) s = `0${s.slice(3)}`
  return /^01[3-9]\d{8}$/.test(s) ? s : null
}

/** Server-side check of one mobile field. Blank stays allowed (these fields are
 *  optional). A value equal to what's already stored is let through untouched,
 *  so a record with legacy bad data can still be edited without touching it;
 *  only a new/changed value must be valid, and it is stored normalised. */
export function checkMobile(
  raw: string | null,
  existing?: string | null,
): { value: string | null; invalid: boolean } {
  if (!raw) return { value: null, invalid: false }
  if (raw === (existing ?? '').trim()) return { value: raw, invalid: false }
  const normalized = normalizeBdMobile(raw)
  return normalized ? { value: normalized, invalid: false } : { value: raw, invalid: true }
}

/** `<input>` props for a mobile field: numeric keypad plus a pattern. The
 *  pattern is dropped when the field's current value is already non-empty and
 *  invalid, so legacy data doesn't make the browser block an unrelated edit. */
export function mobileInputProps(current: string | null | undefined, title: string) {
  const legacyInvalid = Boolean(current) && !normalizeBdMobile(current as string)
  return {
    inputMode: 'tel' as const,
    ...(legacyInvalid ? {} : { pattern: '(\\+?(88|৮৮))?[0০][1১][3-9৩-৯][0-9০-৯]{8}', title }),
  }
}
