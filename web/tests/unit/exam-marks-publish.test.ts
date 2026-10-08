import { describe, it, expect } from 'vitest'
import {
  EXAM_CHIP,
  examChip,
  markCellError,
  markRowState,
  overlappingRoutineEntry,
  publishBlock,
  publishMarksComplete,
  schemeHasUsableBands,
  tallyMarks,
  type PublishFacts,
} from '@/lib/exam-setup'

// Owner workflow audit 2026-10-03, academics: marks entry no longer turns
// "not entered" into 0, publishing is gated on a readiness check, the exam
// routine refuses overlapping sittings, and the list and the setup page read
// one status chip.

describe('markCellError', () => {
  it('a blank cell is "not entered", not an error', () => {
    expect(markCellError('', 100)).toBeNull()
    expect(markCellError('   ', 100)).toBeNull()
  })

  it('accepts 0, the maximum and decimals', () => {
    expect(markCellError('0', 100)).toBeNull()
    expect(markCellError('100', 100)).toBeNull()
    expect(markCellError('72.5', 100)).toBeNull()
  })

  it('reports over-maximum instead of clamping', () => {
    expect(markCellError('150', 100)).toBe('overMax')
    expect(markCellError('100.01', 100)).toBe('overMax')
  })

  it('rejects negative and non-numeric input', () => {
    expect(markCellError('-5', 100)).toBe('negative')
    expect(markCellError('abc', 100)).toBe('invalid')
  })
})

describe('markRowState', () => {
  const theoryMcq = { theory_marks: 70, mcq_marks: 30, practical_marks: 0 }

  it('is empty when no applicable component has a value', () => {
    expect(markRowState({ theory: '', mcq: '', practical: '' }, theoryMcq)).toBe('empty')
  })

  it('ignores a component the subject does not have', () => {
    // practical_marks is 0, so whatever sits in `practical` plays no part.
    expect(markRowState({ theory: '60', mcq: '25', practical: '' }, theoryMcq)).toBe('complete')
    expect(markRowState({ theory: '', mcq: '', practical: '9' }, theoryMcq)).toBe('empty')
  })

  it('is partial when only some applicable components are filled', () => {
    expect(markRowState({ theory: '60', mcq: '', practical: '' }, theoryMcq)).toBe('partial')
  })

  it('a typed 0 is an entered mark', () => {
    expect(markRowState({ theory: '0', mcq: '0', practical: '' }, theoryMcq)).toBe('complete')
  })
})

describe('overlappingRoutineEntry', () => {
  const eng = { subject_id: 'eng', exam_date: '2026-12-10', start_time: '10:00:00', end_time: '13:00:00' }

  it('finds a sitting on the same day whose time overlaps', () => {
    const math = { subject_id: 'math', exam_date: '2026-12-10', start_time: '11:00', end_time: '12:00' }
    expect(overlappingRoutineEntry([eng], math)).toBe(eng)
  })

  it('allows back-to-back sittings and other days', () => {
    expect(
      overlappingRoutineEntry([eng], { subject_id: 'math', exam_date: '2026-12-10', start_time: '13:00', end_time: '15:00' }),
    ).toBeNull()
    expect(
      overlappingRoutineEntry([eng], { subject_id: 'math', exam_date: '2026-12-11', start_time: '10:00', end_time: '13:00' }),
    ).toBeNull()
  })

  it("does not clash with the same subject's own sitting (a re-save replaces it)", () => {
    expect(
      overlappingRoutineEntry([eng], { subject_id: 'eng', exam_date: '2026-12-10', start_time: '10:30', end_time: '12:30' }),
    ).toBeNull()
  })

  // #699: sittings of every exam of the class are compared.
  it('clashes with another exam of the class, even for the same subject', () => {
    const other = { ...eng, exam_id: 'half-yearly' }
    const mine = { exam_id: 'model-test', subject_id: 'eng', exam_date: '2026-12-10', start_time: '11:00', end_time: '12:00' }
    expect(overlappingRoutineEntry([other], mine)).toBe(other)
  })

  it('still skips its own sitting when exams are compared', () => {
    const own = { ...eng, exam_id: 'model-test' }
    const mine = { exam_id: 'model-test', subject_id: 'eng', exam_date: '2026-12-10', start_time: '11:00', end_time: '12:00' }
    expect(overlappingRoutineEntry([own], mine)).toBeNull()
  })
})

describe('publish readiness', () => {
  const ready: PublishFacts = {
    classSet: true,
    schemeType: 'grade_point',
    bandCount: 7,
    students: 14,
    subjects: 2,
    studentsComplete: 14,
    subjectsComplete: 2,
  }

  it('a complete exam is neither blocked nor warned about', () => {
    expect(publishBlock(ready)).toBeNull()
    expect(publishMarksComplete(ready)).toBe(true)
  })

  it('blocks on a missing class, a missing scheme, and a scheme with no bands — in that order', () => {
    expect(publishBlock({ ...ready, classSet: false, schemeType: null })).toBe('noClass')
    expect(publishBlock({ ...ready, schemeType: null })).toBe('noScheme')
    expect(publishBlock({ ...ready, bandCount: 0 })).toBe('noBands')
  })

  it('a numeric scheme needs no bands', () => {
    expect(schemeHasUsableBands('numeric', 0)).toBe(true)
    expect(publishBlock({ ...ready, schemeType: 'numeric', bandCount: 0 })).toBeNull()
    expect(schemeHasUsableBands('letter', 0)).toBe(false)
  })

  it('incomplete marks warn but do not block', () => {
    const partial = { ...ready, studentsComplete: 4, subjectsComplete: 0 }
    expect(publishBlock(partial)).toBeNull()
    expect(publishMarksComplete(partial)).toBe(false)
  })

  it('an exam with no roster or no subjects is never marks-complete', () => {
    expect(publishMarksComplete({ ...ready, students: 0, studentsComplete: 0 })).toBe(false)
    expect(publishMarksComplete({ ...ready, subjects: 0, studentsComplete: 0 })).toBe(false)
  })
})

describe('tallyMarks', () => {
  it('counts only marks of students and subjects that are on the exam', () => {
    const keys = new Set(['s1:eng', 's1:math', 's2:eng', 'gone:eng', 's1:dropped'])
    expect(tallyMarks(['s1', 's2'], ['eng', 'math'], keys)).toEqual({
      entered: 3,
      total: 4,
      studentsComplete: 1,
      subjectsComplete: 1,
    })
  })

  it('reports nothing complete when there is no roster or no subject', () => {
    expect(tallyMarks([], ['eng'], new Set())).toEqual({ entered: 0, total: 0, studentsComplete: 0, subjectsComplete: 0 })
    expect(tallyMarks(['s1'], [], new Set())).toEqual({ entered: 0, total: 0, studentsComplete: 0, subjectsComplete: 0 })
  })
})

describe('examChip', () => {
  it('published results beat every stage', () => {
    expect(examChip('ready', '2026-08-01T00:00:00Z')).toBe('published')
    expect(examChip('closed', '2026-08-01T00:00:00Z')).toBe('published')
  })

  it('otherwise the stage is the chip, and every chip has a label', () => {
    expect(examChip('setup', null)).toBe('setup')
    expect(EXAM_CHIP[examChip('setup', null)].label).toBe('exams.pubDraft')
    expect(EXAM_CHIP.published.label).toBe('exams.pubPublished')
  })
})
