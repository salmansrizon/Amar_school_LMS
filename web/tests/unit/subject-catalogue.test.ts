import { describe, it, expect } from 'vitest'
import { parseGrade, subjectSuggestionsForClass } from '@/lib/subject-catalogue'

describe('parseGrade', () => {
  it('reads a leading digit out of the class name', () => {
    expect(parseGrade('Class 9')).toBe(9)
    expect(parseGrade('9')).toBe(9)
    expect(parseGrade('Class-10')).toBe(10)
  })

  it('reads an English number word', () => {
    expect(parseGrade('Six')).toBe(6)
    expect(parseGrade('Class Nine')).toBe(9)
    expect(parseGrade('Twelve')).toBe(12)
  })

  it('returns null for a name it cannot parse', () => {
    expect(parseGrade('Play Group')).toBeNull()
    expect(parseGrade('KG')).toBeNull()
  })

  it('returns null for a number outside 1-12', () => {
    expect(parseGrade('Class 13')).toBeNull()
    expect(parseGrade('Class 0')).toBeNull()
  })

  it('ignores a digit fused into an unrelated prefix token', () => {
    // A tenant/seed prefix like "SP2" must not be read as grade 2 — the "Six"
    // that follows is the actual grade.
    expect(parseGrade('SP2 Class Six')).toBe(6)
    expect(parseGrade('B2 Nine')).toBe(9)
  })

  it('falls through to a grade word when the only digit token is out of range', () => {
    // "2026" is a standalone, in-range-looking digit token (not fused into a
    // prefix like "SP2"), so it must not short-circuit past the real grade.
    expect(parseGrade('Batch 2026 - Six')).toBe(6)
  })

  it('prefers the token right after "class" over an earlier unrelated in-range number', () => {
    // "2" (from "Group 2") is a standalone, in-range digit that would
    // otherwise win as "the first digit token" — the word right after
    // "class" must take priority.
    expect(parseGrade('Group 2 Class 9')).toBe(9)
    expect(parseGrade('Shift 2 - Class Nine')).toBe(9)
  })

  it('treats an out-of-range "Class N" as authoritative rather than falling back to an earlier number', () => {
    // Once a "Class ___" match exists, it must not fall through to scanning
    // the rest of the name — otherwise "Group 2" would win here.
    expect(parseGrade('Group 2 Class 15')).toBeNull()
  })

  it('prefers a grade word over an unrelated earlier digit when there is no "class" keyword at all', () => {
    // No "Class ___" match here, so this exercises the plain fallback order:
    // a word ("Six") is a much stronger grade signal than a bare digit ("2",
    // from "Group 2") could ever be.
    expect(parseGrade('Group 2 Six')).toBe(6)
  })
})

describe('subjectSuggestionsForClass', () => {
  it('returns the Primary list for grades 1-5', () => {
    const list = subjectSuggestionsForClass({ name: 'Class 3' })
    expect(list).toContain('বাংলা')
    expect(list).toContain('Environment / Social Studies')
    expect(list).not.toContain('Physics')
  })

  it('returns the 6-8 list for those grades', () => {
    const list = subjectSuggestionsForClass({ name: 'Seven' })
    expect(list).toContain('Career Education')
    expect(list).toContain('Agriculture Studies')
    expect(list).not.toContain('Higher Mathematics')
  })

  it('returns SSC common + the matching group for grades 9-10', () => {
    const science = subjectSuggestionsForClass({ name: 'Class 9', group_department: 'Science' })
    expect(science).toContain('Physics')
    expect(science).toContain('বাংলা') // common subject
    expect(science).not.toContain('Accounting')

    const business = subjectSuggestionsForClass({ name: 'Class 10', group_department: 'Business Studies' })
    expect(business).toContain('Accounting')
    expect(business).not.toContain('Physics')
  })

  it('merges every SSC group when no group is set', () => {
    const list = subjectSuggestionsForClass({ name: 'Class 9' })
    expect(list).toContain('Physics')
    expect(list).toContain('Accounting')
    expect(list).toContain('Sociology')
  })

  it('returns the matching HSC group for grades 11-12', () => {
    const humanities = subjectSuggestionsForClass({ name: 'Class 11', group_department: 'Humanities' })
    expect(humanities).toContain('Civics and Good Governance')
    expect(humanities).not.toContain('Chemistry')

    const science = subjectSuggestionsForClass({ name: 'Twelve', group_department: 'Science' })
    expect(science).toContain('Chemistry')
    expect(science).not.toContain('Accounting')
  })

  it('falls back to the full merged list for an unparseable grade', () => {
    const list = subjectSuggestionsForClass({ name: 'Play Group' })
    expect(list).toContain('বাংলা')
    expect(list).toContain('Physics')
    expect(list).toContain('Accounting')
  })

  it('falls back to the full merged list when no class is selected', () => {
    const list = subjectSuggestionsForClass(null)
    expect(list.length).toBeGreaterThan(20)
  })

  // A duplicate entry (e.g. a subject common to both the SSC compulsory list
  // and its science group) would render as a duplicate <ComboboxItem> key.
  it('never returns a duplicate subject name, for any grade/group combination', () => {
    const classes = [
      { name: 'Class 3' },
      { name: 'Seven' },
      { name: 'Class 9' },
      { name: 'Class 9', group_department: 'Science' },
      { name: 'Class 10', group_department: 'Humanities' },
      { name: 'Class 10', group_department: 'Business Studies' },
      { name: 'Class 11' },
      { name: 'Twelve', group_department: 'Science' },
      { name: 'Play Group' },
    ]
    for (const cls of classes) {
      const list = subjectSuggestionsForClass(cls)
      expect(new Set(list).size).toBe(list.length)
    }
    expect(new Set(subjectSuggestionsForClass(null)).size).toBe(subjectSuggestionsForClass(null).length)
  })
})
