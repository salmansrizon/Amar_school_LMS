// Institute Setup & Misc (issue #39, PRD §5.11) helpers: institute-profile
// validation, daily-checklist reporting, and logistics-index search — kept
// pure for unit testing.

import type { MessageKey } from '@/lib/i18n'

export type EducationLevel = 'primary' | 'secondary' | 'higher_secondary' | 'madrasah'

export const EDUCATION_LEVELS: { key: EducationLevel; label: { bn: string; en: string } }[] = [
  { key: 'primary', label: { bn: 'প্রাথমিক', en: 'Primary' } },
  { key: 'secondary', label: { bn: 'মাধ্যমিক', en: 'Secondary' } },
  { key: 'higher_secondary', label: { bn: 'উচ্চ মাধ্যমিক', en: 'Higher Secondary' } },
  { key: 'madrasah', label: { bn: 'মাদ্রাসা', en: 'Madrasah' } },
]

const EDUCATION_LEVEL_KEYS: ReadonlySet<string> = new Set(EDUCATION_LEVELS.map((l) => l.key))

/** The fixed set a School's `configured_shifts` is drawn from (issue #576,
 *  map #568/#582) — four static, code-owned values, not tenant-extensible
 *  data (no School ever adds a fifth). Mirrors EMPLOYEE_CATEGORIES's shape
 *  (web/lib/employees.ts) exactly: a plain array plus a pure membership
 *  check, `schools.configured_shifts` CHECK-constrained to the same four
 *  strings at the DB layer (migration 0176) so this list and that constraint
 *  can never drift apart. Every downstream Shift feature (Global Shift
 *  Selection, Class Offering's `shift` column, Employee multi-shift
 *  assignment) derives its choices from `schools.configured_shifts`, never
 *  from this constant directly — this is only the outer bound. */
export const ACADEMIC_SHIFTS = ['Morning', 'Day', 'Evening', 'Night'] as const
export type AcademicShift = (typeof ACADEMIC_SHIFTS)[number]

export function isKnownAcademicShift(value: string): value is AcademicShift {
  return (ACADEMIC_SHIFTS as readonly string[]).includes(value)
}

/** One source for every UI that renders a Shift's display label — was
 *  independently redeclared per consumer (Institute Profile, Class
 *  Offerings, Employee assignment, Global Shift Selection), which let a
 *  future 5th shift or a relabeled key silently drift out of sync in
 *  whichever copy got missed. Centralized here instead, alongside
 *  ACADEMIC_SHIFTS itself. */
export const ACADEMIC_SHIFT_LABEL_KEY: Record<AcademicShift, MessageKey> = {
  Morning: 'institute.shiftMorning',
  Day: 'institute.shiftDay',
  Evening: 'institute.shiftEvening',
  Night: 'institute.shiftNight',
}

export interface InstituteProfileInput {
  name: string
  institute_code?: string | null
  eiin_no?: string | null
  mpo_enlisted: boolean
  mpo_code?: string | null
  center_code?: string | null
  education_levels: string[]
  // Print-header fields (issue #92) — free text that goes on every printable.
  address_line?: string | null
  mobile?: string | null
  email?: string | null
  // Roll numbering (issue #503): how much each auto-assigned roll steps by,
  // within assign_student_roll's class+section scope.
  roll_number_increment: number
  // Shift Configuration (issue #576, Wave 5/#590): which of the four fixed
  // Shifts this School uses. Empty = No Shift, no separate boolean.
  configured_shifts: string[]
}

export type InstituteProfileError =
  | 'nameRequired'
  | 'mpoCodeRequired'
  | 'eiinInvalid'
  | 'educationLevelInvalid'
  | 'emailInvalid'
  | 'rollIncrementInvalid'
  | 'configuredShiftsInvalid'

/** Business rules: a name is always required; an MPO-enlisted institute must
 *  record its MPO code (else the flag is meaningless data-entry noise); a
 *  present EIIN must be the fixed 6-digit format DSHE issues; education
 *  levels are limited to the fixed PRD set (checkbox UI, not free text).
 *  Address and mobile stay free text — they print exactly as typed (map #91
 *  grilling decision 5) — but a malformed email would print on every
 *  document, so that one is shape-checked. Roll increment mirrors the DB's
 *  `roll_number_increment > 0` check — a positive whole number.
 *  `configured_shifts` is checked the same way as `education_levels`: a
 *  fixed vocabulary, checkbox UI, no free text — duplicates are tolerated
 *  here (a checkbox list can't produce them by construction) and are only
 *  ever normalized away, never rejected, matching #576's resolution. */
export function validateInstituteProfile(input: InstituteProfileInput): InstituteProfileError | null {
  if (!input.name.trim()) return 'nameRequired'
  if (input.mpo_enlisted && !input.mpo_code?.trim()) return 'mpoCodeRequired'
  if (input.eiin_no && !/^\d{6}$/.test(input.eiin_no.trim())) return 'eiinInvalid'
  if (input.education_levels.some((l) => !EDUCATION_LEVEL_KEYS.has(l))) return 'educationLevelInvalid'
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'emailInvalid'
  if (!Number.isInteger(input.roll_number_increment) || input.roll_number_increment < 1)
    return 'rollIncrementInvalid'
  if (input.configured_shifts.some((s) => !isKnownAcademicShift(s))) return 'configuredShiftsInvalid'
  return null
}

// Administrative daily checklist (PRD §5.11, ui.md issue 4 / #150).
//
// The item list is now an editable, school-scoped template
// (activity_checklist_items) rather than a fixed 5, and a day's tick state is a
// jsonb map of item id -> true (daily_checklists.ticks). Helpers take the
// current template plus that map, so nothing here hardcodes the items.

export interface ActivityChecklistItem {
  id: string
  label_bn: string
  label_en: string
  sort_order: number
}

/** A day's tick state: item id -> whether it was checked. A missing key (or a
 *  false value) means unchecked; keys for since-deleted items are simply
 *  ignored, since counts and status are always taken against the live items. */
export type ChecklistTicks = Record<string, boolean>

export type ChecklistRow = { checklist_date: string; ticks: ChecklistTicks }

// The 5 items every school starts with are seeded per school in migration 0066
// (the DB is the source of truth); the app reads real items from there.

/** This item's label in the active language. */
export function itemLabel(item: ActivityChecklistItem, lang: 'bn' | 'en'): string {
  return lang === 'bn' ? item.label_bn : item.label_en
}

/** Whether an item id is ticked in a day's tick map. */
export function isTicked(ticks: ChecklistTicks | null | undefined, id: string): boolean {
  return Boolean(ticks?.[id])
}

// Write algebra for the ticks map — the single owner of its shape (store only
// ticked ids; absent/false = unchecked). Both server writers (the dashboard
// toggle and the full-form save) and the dashboard's optimistic client state go
// through these, so the map contract lives in one place, not re-encoded per
// call site (#150 deepening).

/** Merge one item's tick into a day's map: set the id when done, drop it when
 *  not — keeping the map a clean set of what's ticked. */
export function applyTick(existing: ChecklistTicks | null | undefined, itemId: string, done: boolean): ChecklistTicks {
  const next: ChecklistTicks = { ...(existing ?? {}) }
  if (done) next[itemId] = true
  else delete next[itemId]
  return next
}

/** Build a fresh tick map from the current template and a "is this id ticked?"
 *  predicate (e.g. a form's checkbox state) — the full-save counterpart to
 *  applyTick. Only ticked ids are stored. */
export function ticksFromForm(items: readonly { id: string }[], isOn: (id: string) => boolean): ChecklistTicks {
  const ticks: ChecklistTicks = {}
  for (const item of items) if (isOn(item.id)) ticks[item.id] = true
  return ticks
}

/** How many of the current template items are ticked for this day. */
export function completedCount(items: ActivityChecklistItem[], ticks: ChecklistTicks | null): number {
  return items.reduce((n, item) => n + (isTicked(ticks, item.id) ? 1 : 0), 0)
}

/** The still-unchecked item ids for a day, in template order — the "due today"
 *  set the dashboard widget highlights. A null tick map means every item is
 *  pending. */
export function pendingChecklistItems(
  items: ActivityChecklistItem[],
  ticks: ChecklistTicks | null,
): string[] {
  return items.filter((item) => !isTicked(ticks, item.id)).map((item) => item.id)
}

export type ChecklistStatus = 'complete' | 'partial' | 'none'

/** complete = every item ticked, none = zero ticked (or no items), else
 *  partial. An empty template reads as 'none'. */
export function checklistStatus(items: ActivityChecklistItem[], ticks: ChecklistTicks | null): ChecklistStatus {
  const n = completedCount(items, ticks)
  if (items.length > 0 && n === items.length) return 'complete'
  if (n === 0) return 'none'
  return 'partial'
}

/** Rows within the inclusive [start, end] date range, newest first — the
 *  date-range report (PRD §5.11). ISO date strings sort lexically, so plain
 *  comparison is enough; start after end naturally yields an empty list. */
export function filterChecklistRange<T extends { checklist_date: string }>(
  rows: T[],
  start: string,
  end: string,
): T[] {
  return rows
    .filter((r) => r.checklist_date >= start && r.checklist_date <= end)
    .sort((a, b) => (a.checklist_date < b.checklist_date ? 1 : a.checklist_date > b.checklist_date ? -1 : 0))
}

// Logistics / physical-file index (PRD §5.11).

export interface LogisticsRow {
  item_type: string
  storage_location: string
  notes: string | null
}

/** Case-insensitive match on item type, storage location or notes (search box). */
export function matchesLogisticsQuery(row: LogisticsRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    row.item_type.toLowerCase().includes(q) ||
    row.storage_location.toLowerCase().includes(q) ||
    (row.notes ?? '').toLowerCase().includes(q)
  )
}
