import { describe, expect, it } from 'vitest'
import {
  ALLOWED_FACTS,
  KIND_LABEL,
  PRINT_KINDS,
  buildVerifyUrl,
  changedAfterPrint,
  isPrintKind,
  parsePrintDate,
  printDateStamp,
  toVerifyModel,
  type PrintKind,
} from '@/lib/print-verify'

const TOKEN = '0123456789abcdef0123456789abcdef'
const REF = '11111111-2222-4333-8444-555555555555'
const ORIGIN = 'https://demo.example.test'

describe('buildVerifyUrl', () => {
  it('carries kind, token, reference and print date', () => {
    expect(buildVerifyUrl({ origin: ORIGIN, kind: 'mark_sheet', token: TOKEN, ref: REF, printDate: '20261008' })).toBe(
      `${ORIGIN}/verify/d/mark_sheet/${TOKEN}/${REF}?p=20261008`,
    )
  })

  it('has no reference segment for a kind without a record', () => {
    expect(buildVerifyUrl({ origin: ORIGIN, kind: 'template_homework', token: TOKEN, printDate: '20261008' })).toBe(
      `${ORIGIN}/verify/d/template_homework/${TOKEN}?p=20261008`,
    )
  })

  it('builds nothing without a well-formed token', () => {
    for (const token of [null, undefined, '', 'abc', TOKEN.toUpperCase(), `${TOKEN}0`, '../../school'])
      expect(buildVerifyUrl({ origin: ORIGIN, kind: 'id_cards', token, printDate: '20261008' })).toBeNull()
  })

  it('builds nothing with a malformed reference, or without one where the kind needs it', () => {
    expect(buildVerifyUrl({ origin: ORIGIN, kind: 'seat_plan', token: TOKEN, ref: 'x', printDate: '20261008' })).toBeNull()
    for (const kind of ['mark_sheet', 'admit_card', 'fee_receipt', 'class_routine', 'exam_routine'] as const)
      expect(buildVerifyUrl({ origin: ORIGIN, kind, token: TOKEN, ref: null, printDate: '20261008' })).toBeNull()
    // The attendance book over several classes is the one list without a class.
    expect(buildVerifyUrl({ origin: ORIGIN, kind: 'attendance_book', token: TOKEN, ref: null, printDate: '20261008' })).not.toBeNull()
  })

  it('stamps the school day, not the UTC day', () => {
    // 20:00 UTC on the 7th is already the 8th in Dhaka.
    expect(printDateStamp(new Date('2026-10-07T20:00:00Z'))).toBe('20261008')
  })
})

describe('parsePrintDate', () => {
  const today = '2026-10-08'
  it('reads YYYYMMDD', () => {
    expect(parsePrintDate('20261008', today)).toBe('2026-10-08')
    expect(parsePrintDate('20240229', today)).toBe('2024-02-29')
  })
  it('ignores anything else', () => {
    for (const raw of ['2026-10-08', '2026108', '202610080', '20261308', '20260230', '20250229', 'abcdefgh', '', ' 20261008', undefined, null, 20261008, ['20261008']])
      expect(parsePrintDate(raw, today)).toBeNull()
  })
  it('ignores a date after today', () => {
    expect(parsePrintDate('20261009', today)).toBeNull()
  })
})

describe('changedAfterPrint', () => {
  it('is true only for a change on a later school day', () => {
    expect(changedAfterPrint('2026-10-09T05:00:00Z', '2026-10-08')).toBe(true)
    // Same Dhaka day as the print: cannot be told apart from the print itself.
    expect(changedAfterPrint('2026-10-08T12:00:00Z', '2026-10-08')).toBe(false)
    expect(changedAfterPrint('2026-10-01T12:00:00Z', '2026-10-08')).toBe(false)
  })
  it('uses the school day for the boundary', () => {
    // 19:00 UTC on the 8th is 01:00 on the 9th in Dhaka.
    expect(changedAfterPrint('2026-10-08T19:00:00Z', '2026-10-08')).toBe(true)
  })
  it('is false without both sides', () => {
    expect(changedAfterPrint(null, '2026-10-08')).toBe(false)
    expect(changedAfterPrint('2026-10-09T05:00:00Z', null)).toBe(false)
    expect(changedAfterPrint('not a date', '2026-10-08')).toBe(false)
  })
})

/** Everything the function could ever return, plus things it must never. */
const EVERYTHING = {
  valid: true,
  reason: null,
  school_name: 'Demo School',
  school_logo_path: 'logos/demo.png',
  student_name: 'Ayesha Rahman',
  class_name: 'Nine',
  section: 'A',
  roll_number: 7,
  student_no: 'S-0007',
  exam_name: 'Annual',
  exam_year: 2026,
  month: 9,
  year: 2026,
  amount: 1500,
  paid_at: '2026-09-10T04:00:00Z',
  void_at: '2026-09-12T04:00:00Z',
  class_year: 2026,
  changed_at: '2026-09-12T04:00:00Z',
  // what 0260 returns, plus what an older or wider function might
  results: {
    complete: true,
    total_obtained: 175,
    total_full: 200,
    scheme: { scheme_type: 'grade_point', bands: [{ label: 'A+', grade_point: 5 }] },
    subjects: [{ full_marks: 100, obtained: 85 }, { full_marks: 100, obtained: 90 }],
    gpa: 5,
    grade: 'A+',
    passed: true,
  },
  // never allowed
  guardian_name: 'Mr Rahman',
  guardian_mobile: '01700000000',
  address: 'Dhaka',
  date_of_birth: '2012-01-01',
  public_token: TOKEN,
  student_id: REF,
  photo_path: 'x.jpg',
  subject_marks: [{ name: 'Bangla', obtained: 85 }],
  student_count: 40,
}
const raw = (kind: PrintKind, over: Record<string, unknown> = {}) => ({ ...EVERYTHING, kind, ...over })

describe('toVerifyModel', () => {
  it('never carries a key outside the allow-list, for any kind', () => {
    const top = ['changedAt', 'facts', 'kind', 'logoPath', 'reason', 'schoolName', 'valid']
    for (const kind of PRINT_KINDS) {
      const model = toVerifyModel(kind, raw(kind))!
      expect(Object.keys(model).sort(), kind).toEqual(top)
      for (const key of Object.keys(model.facts)) expect(ALLOWED_FACTS[kind], `${kind}.${key}`).toContain(key)
      const text = JSON.stringify(model)
      for (const secret of ['Mr Rahman', '01700000000', 'Dhaka', '2012-01-01', TOKEN, REF, 'x.jpg', 'Bangla', 'student_count'])
        expect(text, `${kind} leaks ${secret}`).not.toContain(secret)
      // Totals only: nothing per subject, no scheme, no GPA / grade / pass.
      expect(text, kind).not.toMatch(/"obtained"|"full_marks"|"subjects"|"scheme"|"bands"|gpa|grade|passed|A\+|\b85\b|\b90\b/i)
    }
  })

  it('names no student on a whole-class, routine or template document', () => {
    for (const kind of ['attendance_book', 'class_routine', 'exam_attendance_sheet', 'seat_plan', 'exam_routine', 'id_cards', 'general_ledger', 'template_admission'] as const) {
      const { facts } = toVerifyModel(kind, raw(kind))!
      expect(facts.studentName, kind).toBeUndefined()
      expect(facts.roll, kind).toBeUndefined()
    }
    expect(toVerifyModel('template_homework', raw('template_homework'))!.facts).toEqual({})
    expect(toVerifyModel('seat_plan', raw('seat_plan'))!.facts).toEqual({ examName: 'Annual', examYear: 2026 })
    expect(toVerifyModel('class_routine', raw('class_routine'))!.facts).toEqual({ className: 'Nine', section: 'A', classYear: 2026 })
  })

  it('mark sheet / progress report: identity, exam and total marks only', () => {
    for (const kind of ['mark_sheet', 'progress_report'] as const)
      expect(toVerifyModel(kind, raw(kind))!.facts).toEqual({
        studentName: 'Ayesha Rahman',
        className: 'Nine',
        section: 'A',
        roll: 7,
        examName: 'Annual',
        examYear: 2026,
        totalObtained: 175,
        totalFull: 200,
      })
  })

  it('unpublished or archived result shows no result figures, even if they were sent', () => {
    for (const reason of ['unpublished', 'archived']) {
      const model = toVerifyModel('mark_sheet', raw('mark_sheet', { valid: false, reason }))!
      expect(model.valid).toBe(false)
      expect(model.reason).toBe(reason)
      for (const key of ['totalObtained', 'totalFull', 'incomplete']) expect(model.facts).not.toHaveProperty(key)
    }
  })

  it('not complete, or totals missing, is Incomplete with no figures', () => {
    for (const results of [{ complete: false }, { complete: false, total_obtained: 85, total_full: 200 }, { complete: true }, { complete: true, total_obtained: '175', total_full: 200 }]) {
      const { facts } = toVerifyModel('mark_sheet', raw('mark_sheet', { results }))!
      expect(facts.incomplete).toBe(true)
      expect(facts).not.toHaveProperty('totalObtained')
      expect(facts).not.toHaveProperty('totalFull')
    }
  })

  it('admit card: identity and exam, no results', () => {
    expect(toVerifyModel('admit_card', raw('admit_card'))!.facts).toEqual({
      studentName: 'Ayesha Rahman', className: 'Nine', section: 'A', roll: 7, examName: 'Annual', examYear: 2026,
    })
    expect(toVerifyModel('admit_card', raw('admit_card', { valid: false, reason: 'exam_closed' }))!.reason).toBe('exam_closed')
  })

  it('fee receipt: amount and payment date; a voided one shows the void date and no money', () => {
    const paid = toVerifyModel('fee_receipt', raw('fee_receipt', { void_at: null }))!
    expect(paid.facts).toEqual({
      studentName: 'Ayesha Rahman', className: 'Nine', section: 'A', month: 9, year: 2026, amount: 1500, paidAt: '2026-09-10T04:00:00Z',
    })
    expect(paid.changedAt).toBe('2026-09-12T04:00:00Z')

    const voided = toVerifyModel('fee_receipt', raw('fee_receipt', { valid: false, reason: 'voided' }))!
    expect(voided.valid).toBe(false)
    expect(voided.facts.voidAt).toBe('2026-09-12T04:00:00Z')
    expect(voided.facts).not.toHaveProperty('amount')
    expect(voided.facts).not.toHaveProperty('paidAt')
  })

  it('admission form carries the student number; other single-student prints do not', () => {
    expect(toVerifyModel('admission_form', raw('admission_form'))!.facts).toEqual({
      studentName: 'Ayesha Rahman', className: 'Nine', section: 'A', studentNo: 'S-0007',
    })
    for (const kind of ['student_log', 'fee_statement'] as const)
      expect(toVerifyModel(kind, raw(kind))!.facts).toEqual({ studentName: 'Ayesha Rahman', className: 'Nine', section: 'A' })
  })

  it('is "not found" for null, another kind, or a shape that is not ours', () => {
    expect(toVerifyModel('mark_sheet', null)).toBeNull()
    expect(toVerifyModel('mark_sheet', raw('admit_card'))).toBeNull()
    expect(toVerifyModel('mark_sheet', [raw('mark_sheet')])).toBeNull()
    expect(toVerifyModel('mark_sheet', raw('mark_sheet', { valid: 'yes' }))).toBeNull()
    expect(toVerifyModel('mark_sheet', raw('mark_sheet', { school_name: null }))).toBeNull()
    expect(toVerifyModel('mark_sheet', 'mark_sheet')).toBeNull()
  })

  it('drops a value of the wrong type and an unknown reason', () => {
    const model = toVerifyModel('admit_card', raw('admit_card', { roll_number: '7; drop table', reason: 'because' }))!
    expect(model.facts).not.toHaveProperty('roll')
    expect(model.reason).toBeNull()
  })
})

describe('kinds', () => {
  it('every kind has a label and an allow-list, and nothing else is a kind', () => {
    for (const kind of PRINT_KINDS) {
      expect(KIND_LABEL[kind]).toBeTruthy()
      expect(ALLOWED_FACTS[kind]).toBeDefined()
    }
    for (const bad of ['', 'markSheet', 'MARK_SHEET', 'id_card', '__proto__', 'constructor', null, 1])
      expect(isPrintKind(bad)).toBe(false)
  })
})
