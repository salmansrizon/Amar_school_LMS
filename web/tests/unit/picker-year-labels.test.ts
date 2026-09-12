import { describe, it, expect } from 'vitest'
import { classCatalogueLabel, classCatalogueOptions } from '@/lib/class-catalogue'

// Issue #621 — surgical follow-up to map #609 (T5/#614, T6/#615): every
// remaining Class Offering picker/dropdown now selects `academic_year` and
// threads the School's `showYear` (`startedAcademicYears.length > 1`, the
// exact boolean T6/#615 established) into the one shared
// classCatalogueLabel/classCatalogueOptions formatter — never a forked
// label. Each block below mirrors the exact column set the touched page now
// selects (see each surface's own `.select(...)`) so the label-formatting
// half of each surface's wiring is pinned; it does not read the page's
// actual query string, so it cannot by itself catch a column later dropped
// from that `.select(...)`.

describe('#621 — Student Admission / Bulk Login / Student Transfer pickers (classCatalogueOptions)', () => {
  // students/new/page.tsx, students/logins/page.tsx,
  // students/[id]/transfer/page.tsx: id, name, section, group_department,
  // shift, academic_year.
  const rows = [
    { id: 'off-2026', name: 'Nine', section: 'A', group_department: 'Science', shift: 'Morning', academic_year: 2026 },
    { id: 'off-2027', name: 'Nine', section: 'A', group_department: 'Science', shift: 'Morning', academic_year: 2027 },
  ]

  it('showYear=false (single started year): byte-identical to pre-#621 labels', () => {
    expect(classCatalogueOptions(rows, false).map((o) => o.label)).toEqual([
      'Nine (Science) - Morning - A',
      'Nine (Science) - Morning - A',
    ])
  })

  it('showYear=true (more than one started year): distinguishes the two Offerings by year', () => {
    expect(classCatalogueOptions(rows, true).map((o) => o.label)).toEqual([
      'Nine (Science) - Morning - A — 2026',
      'Nine (Science) - Morning - A — 2027',
    ])
  })
})

describe('#621 — Subject Assignment / Routine builder ClassPicker (classCatalogueLabel)', () => {
  // classes/routine/routine-cell.tsx's shared ClassPicker, fed by
  // routine/page.tsx (id, name, section, group_department, shift,
  // academic_year) and subject-assignment/page.tsx (id, name, section,
  // shift, academic_year — no group_department).
  const withGroup = { name: 'Nine', section: 'A', group_department: 'Science', shift: 'Morning', academic_year: 2027 }
  const noGroup = { name: 'Nine', section: 'A', shift: 'Morning', academic_year: 2027 }

  it('routine builder row: year appended only when showYear is true', () => {
    expect(classCatalogueLabel(withGroup, false)).toBe('Nine (Science) - Morning - A')
    expect(classCatalogueLabel(withGroup, true)).toBe('Nine (Science) - Morning - A — 2027')
  })

  it('subject assignment row (no group_department column): year still appends', () => {
    expect(classCatalogueLabel(noGroup, false)).toBe('Nine - Morning - A')
    expect(classCatalogueLabel(noGroup, true)).toBe('Nine - Morning - A — 2027')
  })
})

describe('#621 — Exam Promotion "Promote To" picker (classCatalogueLabel)', () => {
  // exams/[id]/promotion/page.tsx: id, name, section, group_department,
  // shift, academic_year. Used both for the option list and for the picked
  // target's own display label (promotion-controls.tsx's targetClass).
  const target = { name: 'Ten', section: 'B', group_department: null, shift: null, academic_year: 2027 }

  it('option list and picked-target label agree, and both respect showYear', () => {
    expect(classCatalogueLabel(target, false)).toBe('Ten - B')
    expect(classCatalogueLabel(target, true)).toBe('Ten - B — 2027')
  })
})

describe('#621 — Exam Basic Info class-assignment picker (classCatalogueLabel)', () => {
  // exams/[id]/page.tsx: id, name, section, group_department, shift, academic_year.
  const row = { name: 'Eight', section: 'C', shift: 'Day', academic_year: 2026 }

  it('year appended only when the School has more than one started year', () => {
    expect(classCatalogueLabel(row, false)).toBe('Eight - Day - C')
    expect(classCatalogueLabel(row, true)).toBe('Eight - Day - C — 2026')
  })
})

describe('#621 — Exam Combinations Add-Combination picker (classCatalogueLabel)', () => {
  // exams/combinations/page.tsx: id, name, section, group_department, shift,
  // academic_year — shared with the existing-combination card's own
  // classLabel, which stays un-wired (out of scope, #621's own exclusion).
  const row = { name: 'Seven', section: null, group_department: 'Humanities', shift: null, academic_year: 2025 }

  it('Add-Combination option carries the year; a null section produces no dangling separator', () => {
    expect(classCatalogueLabel(row, false)).toBe('Seven (Humanities)')
    expect(classCatalogueLabel(row, true)).toBe('Seven (Humanities) — 2025')
  })
})

describe('#621 — Employees->New Class Teacher picker (classCatalogueLabel)', () => {
  // employees/new/page.tsx builds its own `{ id, label, taken }` options
  // inline via classCatalogueLabel — not classCatalogueOptions — since it
  // also needs class_teacher_id for the `taken` flag.
  const row = { name: 'Six', section: 'A', group_department: null, shift: 'Evening', academic_year: 2027 }

  it('label threads showYear the same as every other classCatalogueLabel call site', () => {
    expect(classCatalogueLabel(row, false)).toBe('Six - Evening - A')
    expect(classCatalogueLabel(row, true)).toBe('Six - Evening - A — 2027')
  })
})

describe('#621 — Fee Collection class filter picker (classCatalogueLabel)', () => {
  // fees/page.tsx: id, name, section, group_department, shift, academic_year.
  const row = { name: 'Five', section: 'A', group_department: null, shift: null, academic_year: 2026 }

  it('filter option carries the year only when showYear is true', () => {
    expect(classCatalogueLabel(row, false)).toBe('Five - A')
    expect(classCatalogueLabel(row, true)).toBe('Five - A — 2026')
  })
})

describe('#621 — showYear condition (T5/T6 recipe reused verbatim)', () => {
  // Every touched page computes this exact expression off
  // getSchoolContext()'s startedAcademicYears — not re-derived, not inferred
  // from the fetched Offering set.
  const showYear = (startedAcademicYears: readonly number[]) => startedAcademicYears.length > 1

  it('a single started year (or none) keeps every picker byte-identical to pre-#621', () => {
    expect(showYear([])).toBe(false)
    expect(showYear([2027])).toBe(false)
  })

  it('more than one started year turns the year segment on', () => {
    expect(showYear([2026, 2027])).toBe(true)
  })
})
