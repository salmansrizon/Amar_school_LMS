import { describe, it, expect } from 'vitest'
import {
  EDUCATION_LEVELS,
  ACADEMIC_SHIFTS,
  isKnownAcademicShift,
  validateInstituteProfile,
  completedCount,
  checklistStatus,
  pendingChecklistItems,
  applyTick,
  ticksFromForm,
  filterChecklistRange,
  matchesLogisticsQuery,
  type ActivityChecklistItem,
  type ChecklistRow,
  type InstituteProfileInput,
} from '@/lib/institute'

// The checklist is now an editable template of items (ids) plus a per-day tick
// map of item id -> true; helpers take both, hardcoding nothing.
const ITEMS: ActivityChecklistItem[] = [
  { id: 'a', label_bn: 'পতাকা', label_en: 'Flag hoisted', sort_order: 0 },
  { id: 'b', label_bn: 'সংগীত', label_en: 'Anthem', sort_order: 1 },
  { id: 'c', label_bn: 'সমাবেশ', label_en: 'Assembly', sort_order: 2 },
  { id: 'd', label_bn: 'ক্লাস', label_en: 'Classes on time', sort_order: 3 },
  { id: 'e', label_bn: 'পরিষ্কার', label_en: 'Premises cleaned', sort_order: 4 },
]

// Institute Setup & Misc (issue #39, PRD §5.11) domain seams: profile field
// validation and checklist date-range reporting, kept pure for unit testing.

const profile = (over: Partial<InstituteProfileInput> = {}): InstituteProfileInput => ({
  name: 'Amar School High School',
  institute_code: 'ASH-0142',
  eiin_no: '123456',
  mpo_enlisted: false,
  mpo_code: null,
  center_code: null,
  education_levels: ['primary', 'secondary'],
  roll_number_increment: 1,
  configured_shifts: [],
  ...over,
})

describe('validateInstituteProfile', () => {
  it('accepts a well-formed profile', () => {
    expect(validateInstituteProfile(profile())).toBeNull()
  })

  it('requires a non-empty name', () => {
    expect(validateInstituteProfile(profile({ name: '  ' }))).toBe('nameRequired')
  })

  it('requires an MPO code when MPO-enlisted', () => {
    expect(validateInstituteProfile(profile({ mpo_enlisted: true, mpo_code: null }))).toBe(
      'mpoCodeRequired',
    )
    expect(validateInstituteProfile(profile({ mpo_enlisted: true, mpo_code: '  ' }))).toBe(
      'mpoCodeRequired',
    )
    expect(
      validateInstituteProfile(profile({ mpo_enlisted: true, mpo_code: 'MPO-88213' })),
    ).toBeNull()
  })

  it('rejects a malformed EIIN (must be 6 digits)', () => {
    expect(validateInstituteProfile(profile({ eiin_no: '12345' }))).toBe('eiinInvalid')
    expect(validateInstituteProfile(profile({ eiin_no: 'ABCDEF' }))).toBe('eiinInvalid')
  })

  it('allows a blank EIIN (optional field)', () => {
    expect(validateInstituteProfile(profile({ eiin_no: null }))).toBeNull()
  })

  // Print-header fields (issue #92): free text by design, but a typo'd email
  // would print on every document, so the one checkable field is checked.
  it('accepts the print-header contact fields', () => {
    expect(
      validateInstituteProfile(
        profile({ address_line: 'ঝিকরগাছা, যশোর', mobile: '01711-000000', email: 'info@a.edu.bd' }),
      ),
    ).toBeNull()
  })

  it('rejects a malformed email', () => {
    expect(validateInstituteProfile(profile({ email: 'info@' }))).toBe('emailInvalid')
    expect(validateInstituteProfile(profile({ email: 'not-an-email' }))).toBe('emailInvalid')
  })

  // Roll numbering (issue #503): mirrors the DB's roll_number_increment > 0 check.
  it('accepts a positive whole-number roll increment', () => {
    expect(validateInstituteProfile(profile({ roll_number_increment: 2 }))).toBeNull()
  })

  it('rejects a non-positive or fractional roll increment', () => {
    expect(validateInstituteProfile(profile({ roll_number_increment: 0 }))).toBe('rollIncrementInvalid')
    expect(validateInstituteProfile(profile({ roll_number_increment: -1 }))).toBe('rollIncrementInvalid')
    expect(validateInstituteProfile(profile({ roll_number_increment: 1.5 }))).toBe('rollIncrementInvalid')
  })

  it('allows blank print-header fields (all optional)', () => {
    expect(
      validateInstituteProfile(profile({ address_line: null, mobile: null, email: null })),
    ).toBeNull()
  })

  it('rejects an education level outside the fixed set', () => {
    expect(validateInstituteProfile(profile({ education_levels: ['primary', 'college'] }))).toBe(
      'educationLevelInvalid',
    )
  })

  // Shift Configuration (issue #576, Wave 5/#590): empty is valid (No Shift),
  // no separate boolean to contradict it.
  it('accepts an empty configured_shifts (No Shift)', () => {
    expect(validateInstituteProfile(profile({ configured_shifts: [] }))).toBeNull()
  })

  it('accepts configured_shifts drawn from the fixed set', () => {
    expect(validateInstituteProfile(profile({ configured_shifts: ['Morning', 'Day'] }))).toBeNull()
  })

  it('rejects a configured_shifts value outside the fixed set', () => {
    expect(validateInstituteProfile(profile({ configured_shifts: ['Morning', 'Noon'] }))).toBe(
      'configuredShiftsInvalid',
    )
  })
})

describe('EDUCATION_LEVELS', () => {
  it('has exactly the four PRD-fixed levels', () => {
    expect(EDUCATION_LEVELS.map((l) => l.key)).toEqual([
      'primary',
      'secondary',
      'higher_secondary',
      'madrasah',
    ])
  })
})

describe('ACADEMIC_SHIFTS / isKnownAcademicShift', () => {
  it('has exactly the four fixed Shifts', () => {
    expect(ACADEMIC_SHIFTS).toEqual(['Morning', 'Day', 'Evening', 'Night'])
  })

  it('recognizes a value from the fixed set', () => {
    expect(isKnownAcademicShift('Morning')).toBe(true)
    expect(isKnownAcademicShift('Night')).toBe(true)
  })

  it('rejects a value outside the fixed set', () => {
    expect(isKnownAcademicShift('Noon')).toBe(false)
    expect(isKnownAcademicShift('')).toBe(false)
  })
})

// Default day: a,b,c,e ticked, d pending (4 of 5).
const checklistRow = (over: Partial<ChecklistRow> = {}): ChecklistRow => ({
  checklist_date: '2026-07-05',
  ticks: { a: true, b: true, c: true, e: true },
  ...over,
})

describe('completedCount / checklistStatus', () => {
  it('counts ticked items against the current template', () => {
    expect(completedCount(ITEMS, checklistRow().ticks)).toBe(4)
    expect(ITEMS.length).toBe(5)
  })

  it('reports "partial" when some but not all items are ticked', () => {
    expect(checklistStatus(ITEMS, checklistRow().ticks)).toBe('partial')
  })

  it('reports "complete" when every item is ticked', () => {
    expect(checklistStatus(ITEMS, { a: true, b: true, c: true, d: true, e: true })).toBe('complete')
  })

  it('reports "none" when nothing is ticked', () => {
    expect(checklistStatus(ITEMS, {})).toBe('none')
  })

  it('reports "none" for an empty template', () => {
    expect(checklistStatus([], { a: true })).toBe('none')
  })
})

describe('applyTick', () => {
  it('sets an id when done', () => {
    expect(applyTick({ a: true }, 'b', true)).toEqual({ a: true, b: true })
  })
  it('drops an id when not done (not a false value)', () => {
    expect(applyTick({ a: true, b: true }, 'b', false)).toEqual({ a: true })
  })
  it('treats a null map as empty', () => {
    expect(applyTick(null, 'a', true)).toEqual({ a: true })
    expect(applyTick(null, 'a', false)).toEqual({})
  })
  it('does not mutate the input map', () => {
    const orig = { a: true }
    applyTick(orig, 'b', true)
    expect(orig).toEqual({ a: true })
  })
})

describe('ticksFromForm', () => {
  it('keeps only the ids the predicate marks on, storing true', () => {
    const on = new Set(['a', 'd'])
    expect(ticksFromForm(ITEMS, (id) => on.has(id))).toEqual({ a: true, d: true })
  })
  it('is empty when nothing is on', () => {
    expect(ticksFromForm(ITEMS, () => false)).toEqual({})
  })
})

describe('pendingChecklistItems', () => {
  it('returns the un-ticked item ids (the "due today" set)', () => {
    // checklistRow() leaves only item d pending.
    expect(pendingChecklistItems(ITEMS, checklistRow().ticks)).toEqual(['d'])
  })

  it('treats a missing tick map as every item pending — nothing recorded today yet', () => {
    expect(pendingChecklistItems(ITEMS, null)).toEqual(ITEMS.map((i) => i.id))
  })

  it('returns an empty list when the whole checklist is complete', () => {
    expect(pendingChecklistItems(ITEMS, { a: true, b: true, c: true, d: true, e: true })).toEqual([])
  })

  it('preserves the template (sort) order', () => {
    expect(pendingChecklistItems(ITEMS, { b: true, d: true })).toEqual(['a', 'c', 'e'])
  })
})

describe('filterChecklistRange', () => {
  const rows: ChecklistRow[] = [
    checklistRow({ checklist_date: '2026-07-03' }),
    checklistRow({ checklist_date: '2026-07-04' }),
    checklistRow({ checklist_date: '2026-07-05' }),
    checklistRow({ checklist_date: '2026-06-20' }),
  ]

  it('keeps only rows within the inclusive [start, end] range', () => {
    const result = filterChecklistRange(rows, '2026-07-01', '2026-07-05')
    expect(result.map((r) => r.checklist_date)).toEqual([
      '2026-07-05',
      '2026-07-04',
      '2026-07-03',
    ])
  })

  it('is inclusive of both endpoints', () => {
    const result = filterChecklistRange(rows, '2026-07-03', '2026-07-04')
    expect(result.map((r) => r.checklist_date)).toEqual(['2026-07-04', '2026-07-03'])
  })

  it('returns newest-first order', () => {
    const result = filterChecklistRange(rows, '2026-06-01', '2026-07-31')
    expect(result[0].checklist_date).toBe('2026-07-05')
    expect(result.at(-1)!.checklist_date).toBe('2026-06-20')
  })

  it('returns an empty list when start is after end', () => {
    expect(filterChecklistRange(rows, '2026-07-05', '2026-07-01')).toEqual([])
  })
})

describe('matchesLogisticsQuery', () => {
  const item = {
    item_type: 'Admission Files',
    storage_location: 'Cabinet 2, Shelf 3',
    notes: null as string | null,
  }

  it('matches on item type case-insensitively', () => {
    expect(matchesLogisticsQuery(item, 'admission')).toBe(true)
    expect(matchesLogisticsQuery(item, 'exam')).toBe(false)
  })

  it('matches on storage location', () => {
    expect(matchesLogisticsQuery(item, 'shelf 3')).toBe(true)
  })

  it('matches on notes when present', () => {
    expect(matchesLogisticsQuery({ ...item, notes: 'Dispose after 2 years' }, 'dispose')).toBe(
      true,
    )
  })

  it('empty query matches everything', () => {
    expect(matchesLogisticsQuery(item, '  ')).toBe(true)
  })
})
