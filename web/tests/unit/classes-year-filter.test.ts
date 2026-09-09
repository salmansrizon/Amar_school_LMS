import { describe, it, expect } from 'vitest'
import {
  academicYearsOf,
  resolveYearFilter,
  showAcademicYearColumn,
  visibleClasses,
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

describe('showAcademicYearColumn', () => {
  it('is false when every Offering is the same year (no redundant column)', () => {
    expect(showAcademicYearColumn([row({ academic_year: 2026 }), row({ academic_year: 2026 })])).toBe(false)
  })

  it('is true once the set spans more than one distinct year', () => {
    expect(showAcademicYearColumn([row({ academic_year: 2026 }), row({ academic_year: 2027 })])).toBe(true)
  })

  it('a null year does not count — one real year plus legacy nulls keeps the pre-#597 view', () => {
    expect(showAcademicYearColumn([row({ academic_year: 2026 }), row({ academic_year: null })])).toBe(false)
  })

  it('is false for an empty / single-row set', () => {
    expect(showAcademicYearColumn([])).toBe(false)
    expect(showAcademicYearColumn([row()])).toBe(false)
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
