import { describe, it, expect } from 'vitest'
import { buildMarksSave, isMissingFunctionError } from '@/lib/exam-marks-save'

// #679 / #700: what one press of Save stores, and when it needs migration 0223.

const subject = { theory_marks: 70, mcq_marks: 30, practical_marks: 0 }
const row = (studentId: string, theory: string, mcq: string, absent?: boolean) => ({
  studentId,
  theory,
  mcq,
  practical: '',
  absent,
})

describe('buildMarksSave', () => {
  it('stores a fully entered row as numbers, with 0 for a component the subject does not have', () => {
    const save = buildMarksSave([row('a', '55', '২০')], subject)
    expect(save.rows).toEqual([{ student_id: 'a', theory: 55, mcq: 20, practical: 0, is_absent: false }])
    expect(save).toMatchObject({ cleared: [], invalid: false, needsMigration: false })
  })

  it('a row with every cell blank is cleared, not stored as zeros', () => {
    const save = buildMarksSave([row('a', '', ' ')], subject)
    expect(save.rows).toEqual([])
    expect(save.cleared).toEqual(['a'])
    expect(save.needsMigration).toBe(false)
  })

  it('a typed 0 is a real mark, not a blank', () => {
    const save = buildMarksSave([row('a', '0', '0')], subject)
    expect(save.rows[0]).toMatchObject({ theory: 0, mcq: 0, is_absent: false })
    expect(save.cleared).toEqual([])
  })

  it('a half-filled row keeps the blank component as null and needs the migration', () => {
    const save = buildMarksSave([row('a', '55', '')], subject)
    expect(save.rows).toEqual([{ student_id: 'a', theory: 55, mcq: null, practical: 0, is_absent: false }])
    expect(save.needsMigration).toBe(true)
    expect(save.invalid).toBe(false)
  })

  it('an absent student is stored as zeros with the flag, whatever was typed, and needs the migration', () => {
    const save = buildMarksSave([row('a', '55', '', true)], subject)
    expect(save.rows).toEqual([{ student_id: 'a', theory: 0, mcq: 0, practical: 0, is_absent: true }])
    expect(save.cleared).toEqual([])
    expect(save.needsMigration).toBe(true)
  })

  it('refuses a mark above the maximum, a negative one and a non-number', () => {
    expect(buildMarksSave([row('a', '71', '10')], subject).invalid).toBe(true)
    expect(buildMarksSave([row('a', '-1', '10')], subject).invalid).toBe(true)
    expect(buildMarksSave([row('a', '5x', '10')], subject).invalid).toBe(true)
  })

  it('one bad row marks the whole save invalid while the good rows are still shaped', () => {
    const save = buildMarksSave([row('a', '99', '10'), row('b', '10', '10')], subject)
    expect(save.invalid).toBe(true)
    expect(save.rows.map((r) => r.student_id)).toEqual(['b'])
  })
})

describe('isMissingFunctionError', () => {
  it('recognises the function being absent, and nothing else', () => {
    expect(isMissingFunctionError({ code: 'PGRST202' })).toBe(true)
    expect(isMissingFunctionError({ code: '42883' })).toBe(true)
    expect(isMissingFunctionError({ code: '23514' })).toBe(false)
    expect(isMissingFunctionError(null)).toBe(false)
  })
})
