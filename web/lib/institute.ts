// Institute Setup & Misc (issue #39, PRD §5.11) helpers: institute-profile
// validation, daily-checklist reporting, and logistics-index search — kept
// pure for unit testing.

export type EducationLevel = 'primary' | 'secondary' | 'higher_secondary' | 'madrasah'

export const EDUCATION_LEVELS: { key: EducationLevel; label: { bn: string; en: string } }[] = [
  { key: 'primary', label: { bn: 'প্রাথমিক', en: 'Primary' } },
  { key: 'secondary', label: { bn: 'মাধ্যমিক', en: 'Secondary' } },
  { key: 'higher_secondary', label: { bn: 'উচ্চ মাধ্যমিক', en: 'Higher Secondary' } },
  { key: 'madrasah', label: { bn: 'মাদ্রাসা', en: 'Madrasah' } },
]

const EDUCATION_LEVEL_KEYS: ReadonlySet<string> = new Set(EDUCATION_LEVELS.map((l) => l.key))

export interface InstituteProfileInput {
  name: string
  institute_code?: string | null
  eiin_no?: string | null
  mpo_enlisted: boolean
  mpo_code?: string | null
  center_code?: string | null
  education_levels: string[]
}

export type InstituteProfileError =
  | 'nameRequired'
  | 'mpoCodeRequired'
  | 'eiinInvalid'
  | 'educationLevelInvalid'

/** Business rules: a name is always required; an MPO-enlisted institute must
 *  record its MPO code (else the flag is meaningless data-entry noise); a
 *  present EIIN must be the fixed 6-digit format DSHE issues; education
 *  levels are limited to the fixed PRD set (checkbox UI, not free text). */
export function validateInstituteProfile(input: InstituteProfileInput): InstituteProfileError | null {
  if (!input.name.trim()) return 'nameRequired'
  if (input.mpo_enlisted && !input.mpo_code?.trim()) return 'mpoCodeRequired'
  if (input.eiin_no && !/^\d{6}$/.test(input.eiin_no.trim())) return 'eiinInvalid'
  if (input.education_levels.some((l) => !EDUCATION_LEVEL_KEYS.has(l))) return 'educationLevelInvalid'
  return null
}

// Administrative daily checklist (PRD §5.11).

export const CHECKLIST_ITEMS = [
  { key: 'flag_hoisted', label: { bn: 'পতাকা উত্তোলন করা হয়েছে', en: 'Flag hoisted' } },
  {
    key: 'anthem_rendered',
    label: { bn: 'জাতীয় সংগীত পরিবেশিত হয়েছে', en: 'National anthem rendered' },
  },
  { key: 'assembly_held', label: { bn: 'সমাবেশ অনুষ্ঠিত হয়েছে', en: 'Assembly held' } },
  {
    key: 'classes_started_on_time',
    label: { bn: 'সময়মতো ক্লাস শুরু হয়েছে', en: 'Classes started on time' },
  },
  { key: 'premises_cleaned', label: { bn: 'প্রাঙ্গণ পরিষ্কার করা হয়েছে', en: 'Premises cleaned' } },
] as const

export type ChecklistItemKey = (typeof CHECKLIST_ITEMS)[number]['key']

export type ChecklistRow = { checklist_date: string } & Record<ChecklistItemKey, boolean>

/** How many of the fixed 5 items are checked on this row. */
export function completedCount(row: ChecklistRow): number {
  return CHECKLIST_ITEMS.reduce((n, item) => n + (row[item.key] ? 1 : 0), 0)
}

export type ChecklistStatus = 'complete' | 'partial' | 'none'

export function checklistStatus(row: ChecklistRow): ChecklistStatus {
  const n = completedCount(row)
  if (n === CHECKLIST_ITEMS.length) return 'complete'
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
