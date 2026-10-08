// Pure calendar-date logic for the shared DateField. Dates are plain ISO
// `YYYY-MM-DD` strings and are only ever turned into a Date via Date.UTC, so no
// timezone or DST can shift a day (the school lives in Asia/Dhaka, the browser
// may not).
import { numberFmt, type Lang } from '@/lib/i18n'

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Bangla (০-৯) and Arabic-Indic (٠-٩) digits to ASCII. */
export function toAsciiDigits(s: string): string {
  return s
    .replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
}

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

export function toIso(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`
}

/** [y, m, d] of a real calendar date, else null. */
export function parseIso(iso: string | null | undefined): [number, number, number] | null {
  const m = ISO.exec(iso ?? '')
  if (!m) return null
  const [y, mo, d] = [+m[1], +m[2], +m[3]]
  return y >= 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo) ? [y, mo, d] : null
}

export const isValidIso = (iso: string | null | undefined) => parseIso(iso) !== null

/** What a person types: `15/10/2026`, `15-10-2026`, `15.10.2026`, `১৫/১০/২০২৬`,
 *  or already ISO. Returns ISO, or null if it is not a possible date. */
export function parseTyped(text: string): string | null {
  const s = toAsciiDigits(text).trim()
  if (ISO.test(s)) return isValidIso(s) ? s : null
  const m = /^(\d{1,2})[/\-.\s](\d{1,2})[/\-.\s](\d{4})$/.exec(s)
  if (!m) return null
  const iso = toIso(+m[3], +m[2], +m[1])
  return isValidIso(iso) ? iso : null
}

/** dd/mm/yyyy in the reader's digits. Display only. */
export function formatField(iso: string, lang: Lang): string {
  const p = parseIso(iso)
  if (!p) return ''
  const n = (v: number, w: number) => numberFmt(lang, { minimumIntegerDigits: w, useGrouping: false }).format(v)
  return `${n(p[2], 2)}/${n(p[1], 2)}/${n(p[0], 4)}`
}

const utc = (iso: string) => {
  const [y, m, d] = parseIso(iso)!
  return Date.UTC(y, m - 1, d)
}
const fromUtc = (ms: number) => {
  const d = new Date(ms)
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function addDays(iso: string, n: number): string {
  return fromUtc(utc(iso) + n * 86_400_000)
}

/** Same day in another month, clamped to that month's length (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = parseIso(iso)!
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return toIso(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** 0 = Sunday. */
export const weekdayOf = (iso: string) => new Date(utc(iso)).getUTCDay()

/** Six Sunday-first weeks (always six, so the popup does not change height). */
export function monthMatrix(year: number, month: number): { iso: string; outside: boolean }[][] {
  const first = toIso(year, month, 1)
  const start = addDays(first, -weekdayOf(first))
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const iso = addDays(start, w * 7 + d)
      return { iso, outside: parseIso(iso)![1] !== month }
    }),
  )
}

export const isDisabledDay = (iso: string, min?: string, max?: string) =>
  (!!min && iso < min) || (!!max && iso > max)

/** Pull a date inside [min, max]; unchanged when there is no bound. */
export function clampIso(iso: string, min?: string, max?: string): string {
  if (min && isValidIso(min) && iso < min) return min
  if (max && isValidIso(max) && iso > max) return max
  return iso
}

/** Where the keyboard moves the focused day; clamped into [min, max]. null = not a navigation key. */
export function moveFocus(iso: string, key: string, min?: string, max?: string): string | null {
  const wd = weekdayOf(iso)
  const next =
    key === 'ArrowLeft' ? addDays(iso, -1)
    : key === 'ArrowRight' ? addDays(iso, 1)
    : key === 'ArrowUp' ? addDays(iso, -7)
    : key === 'ArrowDown' ? addDays(iso, 7)
    : key === 'PageUp' ? addMonths(iso, -1)
    : key === 'PageDown' ? addMonths(iso, 1)
    : key === 'Home' ? addDays(iso, -wd)
    : key === 'End' ? addDays(iso, 6 - wd)
    : null
  return next && clampIso(next, min, max)
}
