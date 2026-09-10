import { describe, it, expect } from 'vitest'
import {
  academicYearsOf,
  copyClassesControlVisible,
  copyOutcomeKind,
  copySourceYears,
  defaultCopySourceYear,
  newClassYearHint,
  resolveYearFilter,
  showAcademicYearColumn,
  visibleClasses,
  yearFilterOptions,
  type ClassListRow,
} from '@/lib/classes'

// Seam: the Class Offerings list's Academic Year display + filter (issue #597).
// #593 let two Offerings share a name+section across years; #594 added the
// write path that makes multi-year coexistence real. These helpers keep the
// page a thin render over them.

const row = (over: Partial<ClassListRow> = {}): ClassListRow => ({
  name: 'Nine',
  education_level: 'Secondary',
  academic_year: 2026,
  ...over,
})

describe('academicYearsOf', () => {
  it('returns distinct years newest-first', () => {
    expect(
      academicYearsOf([row({ academic_year: 2026 }), row({ academic_year: 2027 }), row({ academic_year: 2026 })]),
    ).toEqual([2027, 2026])
  })

  it('drops nulls — a legacy row with no recorded year is not a filter option', () => {
    expect(academicYearsOf([row({ academic_year: 2026 }), row({ academic_year: null })])).toEqual([2026])
  })

  it('is empty for no rows', () => {
    expect(academicYearsOf([])).toEqual([])
  })
})

describe('showAcademicYearColumn (map #609 — started-year history, not inference)', () => {
  it('is false when the School has started only one year (pre-#597 view)', () => {
    expect(showAcademicYearColumn([2027])).toBe(false)
  })

  it('is true once the School has started more than one year', () => {
    expect(showAcademicYearColumn([2027, 2026])).toBe(true)
  })

  it('is false for a legacy School with no started-year history', () => {
    expect(showAcademicYearColumn([])).toBe(false)
  })

  it('does not infer from the Offering set — a second started year shows the column before any Offering exists in it', () => {
    // The Offerings are all 2026, but the School has started 2027 too.
    expect(showAcademicYearColumn([2027, 2026])).toBe(true)
  })
})

describe('yearFilterOptions (map #609)', () => {
  it('is the selectable years, newest first, with the active year always included', () => {
    expect(yearFilterOptions([2026], 2027)).toEqual([2027, 2026])
  })

  it('never widens past what the caller passed — a globally-deselected year is absent', () => {
    // selectableYears is already present ∩ Global Academic Year Selection.
    expect(yearFilterOptions([2027], 2027)).toEqual([2027])
  })

  it('de-dupes the active year and keeps newest-first order', () => {
    expect(yearFilterOptions([2025, 2027, 2026], 2027)).toEqual([2027, 2026, 2025])
  })

  it('handles a null active year (legacy School row)', () => {
    expect(yearFilterOptions([2026, 2025], null)).toEqual([2026, 2025])
    expect(yearFilterOptions([], null)).toEqual([])
  })
})

describe('resolveYearFilter', () => {
  const present = [2027, 2026]

  it("'all' means every year (null)", () => {
    expect(resolveYearFilter('all', { activeYear: 2027, presentYears: present })).toBeNull()
  })

  it('a present specific year is honoured', () => {
    expect(resolveYearFilter('2026', { activeYear: 2027, presentYears: present })).toBe(2026)
  })

  it('absent -> the active Academic Year (the default view)', () => {
    expect(resolveYearFilter(undefined, { activeYear: 2027, presentYears: present })).toBe(2027)
  })

  it('a year the School has no Offerings in is not invented — falls back to the default', () => {
    expect(resolveYearFilter('2099', { activeYear: 2027, presentYears: present })).toBe(2027)
  })

  it('garbage falls back to the default', () => {
    expect(resolveYearFilter('not-a-year', { activeYear: 2027, presentYears: present })).toBe(2027)
  })

  it('when the active year has no Offerings yet, the default is "all years"', () => {
    // A School that just ran Start Academic Year 2028 but has created no 2028
    // Offering — defaulting to an empty table would be worse than showing all.
    expect(resolveYearFilter(undefined, { activeYear: 2028, presentYears: present })).toBeNull()
  })

  it('handles a null active year (legacy School row)', () => {
    expect(resolveYearFilter(undefined, { activeYear: null, presentYears: present })).toBeNull()
  })

  it('narrows only within the Global Academic Year Selection, never widens it (map #609)', () => {
    // The page feeds `presentYears` = present Offering years ∩ the global
    // selection. A year the user deselected globally is simply not in that set,
    // so ?year=<it> falls back to the default exactly like an absent year.
    const withinGlobalSet = [2027] // 2026 deselected in the global picker
    expect(resolveYearFilter('2026', { activeYear: 2027, presentYears: withinGlobalSet })).toBe(2027)
    expect(resolveYearFilter('2027', { activeYear: 2027, presentYears: withinGlobalSet })).toBe(2027)
  })
})

describe('copySourceYears (map #609, T8 — "Copy Classes from {year}" sources)', () => {
  // counts keyed by year; any year not listed has zero Offerings
  const counts = (m: Record<number, number>) => (y: number) => m[y] ?? 0

  it('is every started year strictly before the active year, newest first', () => {
    expect(
      copySourceYears([2028, 2027, 2026, 2025], 2028, counts({ 2027: 3, 2026: 1, 2025: 0 })),
    ).toEqual([
      { year: 2027, offeringCount: 3 },
      { year: 2026, offeringCount: 1 },
      { year: 2025, offeringCount: 0 },
    ])
  })

  it('excludes the active year and any future started year', () => {
    expect(copySourceYears([2029, 2028, 2027], 2028, counts({ 2027: 2 }))).toEqual([
      { year: 2027, offeringCount: 2 },
    ])
  })

  it('never infers a source from the Offering set — only started years count', () => {
    // Offerings exist in 2026 but the School never started it.
    expect(copySourceYears([2028, 2027], 2028, counts({ 2026: 5, 2027: 0 }))).toEqual([
      { year: 2027, offeringCount: 0 },
    ])
  })

  it('is empty when the School has no active year yet', () => {
    expect(copySourceYears([2027, 2026], null, counts({ 2026: 4 }))).toEqual([])
  })

  it('is empty when the School has never started an earlier year', () => {
    expect(copySourceYears([2028], 2028, counts({}))).toEqual([])
  })
})

describe('defaultCopySourceYear', () => {
  it('is the most-recently-started prior year that actually has Offerings', () => {
    expect(
      defaultCopySourceYear([
        { year: 2027, offeringCount: 0 },
        { year: 2026, offeringCount: 3 },
      ]),
    ).toBe(2026)
  })

  it('falls back to the newest candidate when none have Offerings', () => {
    expect(
      defaultCopySourceYear([
        { year: 2027, offeringCount: 0 },
        { year: 2026, offeringCount: 0 },
      ]),
    ).toBe(2027)
  })

  it('is null when there is no candidate at all', () => {
    expect(defaultCopySourceYear([])).toBeNull()
  })
})

describe('copyClassesControlVisible', () => {
  it('is false when there is no prior started year', () => {
    expect(copyClassesControlVisible([])).toBe(false)
  })

  it('is false when every prior started year has zero Offerings to copy', () => {
    expect(
      copyClassesControlVisible([
        { year: 2027, offeringCount: 0 },
        { year: 2026, offeringCount: 0 },
      ]),
    ).toBe(false)
  })

  it('is true once any prior started year has an Offering to copy', () => {
    expect(
      copyClassesControlVisible([
        { year: 2027, offeringCount: 0 },
        { year: 2026, offeringCount: 1 },
      ]),
    ).toBe(true)
  })
})

describe('copyOutcomeKind (map #609, T8 — result panel wording)', () => {
  it("'all' when everything copied and nothing was skipped", () => {
    expect(copyOutcomeKind({ copied: 3, skipped: 0 })).toBe('all')
  })

  it("'partial' when some copied and some already existed", () => {
    expect(copyOutcomeKind({ copied: 1, skipped: 3 })).toBe('partial')
  })

  it("'none' when nothing was copied — every source class already existed", () => {
    expect(copyOutcomeKind({ copied: 0, skipped: 3 })).toBe('none')
    // a re-run of a completed copy is idempotent: 0 copied, all skipped
    expect(copyOutcomeKind({ copied: 0, skipped: 0 })).toBe('none')
  })
})

describe('visibleClasses', () => {
  const rows = [
    row({ name: 'Nine', education_level: 'Secondary', academic_year: 2026 }),
    row({ name: 'Nine', education_level: 'Secondary', academic_year: 2027 }),
    row({ name: 'Ten', education_level: 'Secondary', academic_year: 2026 }),
    row({ name: 'One', education_level: 'Primary', academic_year: 2026 }),
  ]

  it('year: null shows every year', () => {
    expect(visibleClasses(rows, { q: '', level: '', year: null })).toHaveLength(4)
  })

  it('narrows to one year without touching the other filters', () => {
    expect(visibleClasses(rows, { q: '', level: '', year: 2027 }).map((c) => c.name)).toEqual(['Nine'])
  })

  it('preserves the pre-#597 name search (case-insensitive, trimmed)', () => {
    expect(visibleClasses(rows, { q: '  nine ', level: '', year: null }).map((c) => c.academic_year)).toEqual([
      2026, 2027,
    ])
  })

  it('preserves the pre-#597 Education Level filter, AND-combined with year', () => {
    expect(
      visibleClasses(rows, { q: '', level: 'Primary', year: 2026 }).map((c) => c.name),
    ).toEqual(['One'])
    expect(visibleClasses(rows, { q: '', level: 'Primary', year: 2027 })).toHaveLength(0)
  })
})

// New-Class form read-only Academic Year confirmation (map #609, T9/#618).
// The active year is shown for confirmation only; addClass is unchanged and
// keeps stamping active_academic_year server-side, so this helper never has to
// decide the stored year — only whether a line is shown.
describe('newClassYearHint', () => {
  it('returns the active year when the School has one', () => {
    expect(newClassYearHint(2027)).toBe(2027)
  })

  it('returns null for a pre-backfill School (no active year) — never a fabricated year', () => {
    expect(newClassYearHint(null)).toBeNull()
  })
})
