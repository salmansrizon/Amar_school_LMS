import { describe, it, expect } from 'vitest'
import {
  EDUCATION_LEVELS,
  validateInstituteProfile,
  CHECKLIST_ITEMS,
  completedCount,
  checklistStatus,
  pendingChecklistItems,
  filterChecklistRange,
  matchesLogisticsQuery,
  type ChecklistRow,
  type InstituteProfileInput,
} from '@/lib/institute'

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

const checklistRow = (over: Partial<ChecklistRow> = {}): ChecklistRow => ({
  checklist_date: '2026-07-05',
  flag_hoisted: true,
  anthem_rendered: true,
  assembly_held: true,
  classes_started_on_time: false,
  premises_cleaned: true,
  ...over,
})

describe('completedCount / checklistStatus', () => {
  it('counts checked items out of the fixed 5', () => {
    expect(completedCount(checklistRow())).toBe(4)
    expect(CHECKLIST_ITEMS.length).toBe(5)
  })

  it('reports "partial" when some but not all items are checked', () => {
    expect(checklistStatus(checklistRow())).toBe('partial')
  })

  it('reports "complete" when every item is checked', () => {
    expect(
      checklistStatus(
        checklistRow({
          classes_started_on_time: true,
        }),
      ),
    ).toBe('complete')
  })

  it('reports "none" when nothing is checked', () => {
    expect(
      checklistStatus({
        checklist_date: '2026-07-05',
        flag_hoisted: false,
        anthem_rendered: false,
        assembly_held: false,
        classes_started_on_time: false,
        premises_cleaned: false,
      }),
    ).toBe('none')
  })
})

describe('pendingChecklistItems', () => {
  it('returns the unchecked item keys (the "due today" set)', () => {
    // checklistRow() has only classes_started_on_time false.
    expect(pendingChecklistItems(checklistRow())).toEqual(['classes_started_on_time'])
  })

  it('treats a missing row as every item pending — nothing recorded today yet', () => {
    expect(pendingChecklistItems(null)).toEqual(CHECKLIST_ITEMS.map((i) => i.key))
  })

  it('returns an empty list when the whole checklist is complete', () => {
    expect(pendingChecklistItems(checklistRow({ classes_started_on_time: true }))).toEqual([])
  })

  it('preserves the fixed CHECKLIST_ITEMS order', () => {
    expect(
      pendingChecklistItems({
        flag_hoisted: false,
        anthem_rendered: true,
        assembly_held: false,
        classes_started_on_time: true,
        premises_cleaned: false,
      }),
    ).toEqual(['flag_hoisted', 'assembly_held', 'premises_cleaned'])
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
