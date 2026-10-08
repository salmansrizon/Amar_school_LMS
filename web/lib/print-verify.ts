// Public verification of printed documents: the pure half (no DB, no request).
//
// Every print carries a QR whose URL is
//   /verify/d/<kind>/<token>[/<ref>]?p=YYYYMMDD
// and the public page turns what print_document_facts() (migration 0260)
// returns into a VerifyModel. The database already returns an allow-list per
// kind; toVerifyModel applies the SAME allow-list again, so a wider function
// result can never reach the page.
import { assembleRosterRows } from '@/lib/exam-print-data'
import type { GradingScheme } from '@/lib/grading'
import type { MessageKey } from '@/lib/i18n'
import { schoolToday } from '@/lib/school-time'

/** Kinds whose token is students.public_token. */
export const STUDENT_KINDS = [
  'mark_sheet',
  'progress_report',
  'admit_card',
  'fee_receipt',
  'admission_form',
  'student_log',
  'fee_statement',
] as const

/** Kinds whose token is schools.public_token. */
export const SCHOOL_KINDS = [
  'attendance_book',
  'class_routine',
  'exam_attendance_sheet',
  'seat_plan',
  'exam_routine',
  'id_cards',
  'general_ledger',
  'template_admission',
  'template_attendance',
  'template_exam_answer',
  'template_homework',
  'template_lesson_plan',
] as const

export const PRINT_KINDS = [...STUDENT_KINDS, ...SCHOOL_KINDS] as const
export type PrintKind = (typeof PRINT_KINDS)[number]

export function isPrintKind(value: unknown): value is PrintKind {
  return typeof value === 'string' && (PRINT_KINDS as readonly string[]).includes(value)
}

export function isStudentKind(kind: PrintKind): boolean {
  return (STUDENT_KINDS as readonly string[]).includes(kind)
}

/** The document-type name shown on the public page. Existing names reused. */
export const KIND_LABEL: Record<PrintKind, MessageKey> = {
  mark_sheet: 'markSheet.docWord',
  progress_report: 'progressReport.docWord',
  admit_card: 'admitCard.docWord',
  fee_receipt: 'fees.receipt',
  admission_form: 'verifyDoc.admissionForm',
  student_log: 'attendance.studentLogTitle',
  fee_statement: 'verifyDoc.feeStatement',
  attendance_book: 'attendance.bookRegisterWord',
  class_routine: 'routine.docWord',
  exam_attendance_sheet: 'examAttendanceSheet.docWord',
  seat_plan: 'seatPlan.docWord',
  exam_routine: 'examRoutine.docWord',
  id_cards: 'students.idCard',
  general_ledger: 'ledger.title',
  template_admission: 'institute.templateAdmission',
  template_attendance: 'institute.templateAttendance',
  template_exam_answer: 'institute.templateExamAnswer',
  template_homework: 'institute.templateHomework',
  template_lesson_plan: 'institute.templateLessonPlan',
}

/** Kinds with a record behind them (exam, fee record, class offering): the
 *  function returns nothing for these without the record's id. */
const REF_REQUIRED: readonly PrintKind[] = [
  'mark_sheet',
  'progress_report',
  'admit_card',
  'fee_receipt',
  'class_routine',
  'exam_attendance_sheet',
  'seat_plan',
  'exam_routine',
]

/** Same shape the database default produces: a hyphen-stripped UUIDv4. */
export const TOKEN_RE = /^[0-9a-f]{32}$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// --- URL -------------------------------------------------------------------

/** Today as the QR carries it: `YYYYMMDD` on the school's own calendar. */
export function printDateStamp(now: Date = new Date()): string {
  return schoolToday(now).replaceAll('-', '')
}

/** The absolute link a QR encodes, or null when it could not be a working one
 *  (no token yet, malformed reference): the print then keeps its plain box. */
export function buildVerifyUrl(input: {
  origin: string
  kind: PrintKind
  token: string | null | undefined
  ref?: string | null
  printDate: string
}): string | null {
  const { origin, kind, token, ref, printDate } = input
  if (!isPrintKind(kind) || !token || !TOKEN_RE.test(token)) return null
  if (ref != null && !UUID_RE.test(ref)) return null
  // A link the function is bound to refuse is worse than no QR.
  if (ref == null && REF_REQUIRED.includes(kind)) return null
  return `${origin}/verify/d/${kind}/${token}${ref ? `/${ref}` : ''}?p=${printDate}`
}

/** `?p=YYYYMMDD` → `YYYY-MM-DD`, or null. Strict: eight digits, a real calendar
 *  day, and not after today (a date from the future was not printed by us). */
export function parsePrintDate(raw: unknown, today: string = schoolToday()): string | null {
  if (typeof raw !== 'string' || !/^\d{8}$/.test(raw)) return null
  const y = Number(raw.slice(0, 4))
  const m = Number(raw.slice(4, 6))
  const d = Number(raw.slice(6, 8))
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  return iso > today ? null : iso
}

/** True when the record changed on a LATER school day than it was printed.
 *  The QR carries a day, not a time, so a change on the print day itself is
 *  not reported: it cannot be told apart from the print. */
export function changedAfterPrint(changedAt: string | null, printDate: string | null): boolean {
  if (!changedAt || !printDate) return false
  const at = new Date(changedAt)
  if (Number.isNaN(at.getTime())) return false
  return schoolToday(at) > printDate
}

// --- Page model ------------------------------------------------------------

export type FactKey =
  | 'studentName'
  | 'className'
  | 'section'
  | 'roll'
  | 'studentNo'
  | 'examName'
  | 'examYear'
  | 'gpa'
  | 'grade'
  | 'passed'
  | 'totalObtained'
  | 'incomplete'
  | 'month'
  | 'year'
  | 'amount'
  | 'paidAt'
  | 'voidAt'
  | 'classYear'

const STUDENT: FactKey[] = ['studentName', 'className', 'section']
const EXAM: FactKey[] = ['examName', 'examYear']
const RESULT: FactKey[] = ['gpa', 'grade', 'passed', 'totalObtained', 'incomplete']

/** THE allow-list: the only facts a page model may carry, per kind. Mirrors
 *  the header of migration 0260. */
export const ALLOWED_FACTS: Record<PrintKind, readonly FactKey[]> = {
  mark_sheet: [...STUDENT, 'roll', ...EXAM, ...RESULT],
  progress_report: [...STUDENT, 'roll', ...EXAM, ...RESULT],
  admit_card: [...STUDENT, 'roll', ...EXAM],
  fee_receipt: [...STUDENT, 'month', 'year', 'amount', 'paidAt', 'voidAt'],
  admission_form: [...STUDENT, 'studentNo'],
  student_log: STUDENT,
  fee_statement: STUDENT,
  attendance_book: ['className', 'section', 'classYear'],
  class_routine: ['className', 'section', 'classYear'],
  exam_attendance_sheet: EXAM,
  seat_plan: EXAM,
  exam_routine: EXAM,
  id_cards: [],
  general_ledger: [],
  template_admission: [],
  template_attendance: [],
  template_exam_answer: [],
  template_homework: [],
  template_lesson_plan: [],
}

export type VerifyReason = 'archived' | 'unpublished' | 'exam_closed' | 'voided'
const REASONS: readonly string[] = ['archived', 'unpublished', 'exam_closed', 'voided']

export type Facts = Partial<Record<FactKey, string | number | boolean>>

export interface VerifyModel {
  kind: PrintKind
  valid: boolean
  reason: VerifyReason | null
  schoolName: string
  logoPath: string | null
  facts: Facts
  /** When the record last changed, where the kind has a usable time: a fee
   *  receipt (paid / voided) and a result (published). Null everywhere else. */
  changedAt: string | null
}

/** Function key → fact key, with the type the value must have. */
const SCALARS: [raw: string, fact: FactKey, type: 'string' | 'number'][] = [
  ['student_name', 'studentName', 'string'],
  ['class_name', 'className', 'string'],
  ['section', 'section', 'string'],
  ['roll_number', 'roll', 'number'],
  ['student_no', 'studentNo', 'string'],
  ['exam_name', 'examName', 'string'],
  ['exam_year', 'examYear', 'number'],
  ['month', 'month', 'number'],
  ['year', 'year', 'number'],
  ['amount', 'amount', 'number'],
  ['paid_at', 'paidAt', 'string'],
  ['void_at', 'voidAt', 'string'],
  ['class_year', 'classYear', 'number'],
]

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** print_document_facts() result → page model. Null means "not found": the
 *  function returned null, a different kind, or something that is not ours. */
export function toVerifyModel(kind: PrintKind, raw: unknown): VerifyModel | null {
  if (!isRecord(raw) || raw.kind !== kind || typeof raw.valid !== 'boolean') return null
  const schoolName = str(raw.school_name)
  if (!schoolName) return null

  const valid = raw.valid
  const reason = REASONS.includes(raw.reason as string) ? (raw.reason as VerifyReason) : null
  const allowed = ALLOWED_FACTS[kind]
  const facts: Facts = {}
  for (const [rawKey, fact, type] of SCALARS) {
    const value = raw[rawKey]
    if (allowed.includes(fact) && typeof value === type && value !== '') facts[fact] = value as string | number
  }

  // Belt and braces over the SQL: a voided receipt never shows money, and
  // result figures exist only for a valid (published, not archived) result.
  if (reason === 'voided' || !valid) {
    delete facts.amount
    delete facts.paidAt
  }
  if (valid && allowed.includes('gpa')) Object.assign(facts, resultFacts(raw.results))

  return { kind, valid, reason, schoolName, logoPath: str(raw.school_logo_path), facts, changedAt: str(raw.changed_at) }
}

function parseScheme(raw: unknown): GradingScheme | null {
  if (!isRecord(raw) || !Array.isArray(raw.bands)) return null
  if (!['grade_point', 'letter', 'numeric'].includes(raw.scheme_type as string)) return null
  if (!['individual', 'combined_average', 'optional_conditional'].includes(raw.pass_rule_strategy as string)) return null
  return {
    schemeType: raw.scheme_type as GradingScheme['schemeType'],
    passMarkPercent: Number(raw.pass_mark_percent),
    passRuleStrategy: raw.pass_rule_strategy as GradingScheme['passRuleStrategy'],
    combineSubjectGroups: raw.combine_subject_groups === true,
    bands: raw.bands.filter(isRecord).map((b) => ({
      label: String(b.label),
      minPercent: Number(b.min_percent),
      maxPercent: Number(b.max_percent),
      gradePoint: b.grade_point == null ? null : Number(b.grade_point),
    })),
  }
}

/** GPA / grade / pass / total from the raw published marks, through the same
 *  assembleRosterRows the school's own mark sheet prints from. The per-subject
 *  numbers stop here: only the four figures go into the model. A subject with
 *  no mark makes the result Incomplete, with no figures, as on paper. */
function resultFacts(raw: unknown): Facts {
  if (!isRecord(raw) || !Array.isArray(raw.subjects)) return {}
  const scheme = parseScheme(raw.scheme)
  const subjects = raw.subjects.filter(isRecord)
  if (!scheme || !subjects.length) return { incomplete: true }

  const marks = new Map<string, number>()
  const optional = new Map<string, boolean>()
  const config = subjects.map((s, i) => {
    const id = String(i)
    if (s.obtained != null) marks.set(`s:${id}`, Number(s.obtained))
    optional.set(`s:${id}`, s.optional === true)
    return { id, name: '', theory_marks: Number(s.full_marks), mcq_marks: 0, practical_marks: 0 }
  })
  const [row] = assembleRosterRows(
    config,
    [{ id: 's', full_name: '', roll_number: null, guardian_name: null }],
    marks,
    optional,
    scheme,
    'grade',
  )
  if (!row?.overall || row.marksMissing > 0) return { incomplete: true }

  const facts: Facts = { passed: row.overall.passed, totalObtained: row.totalObtained }
  if (row.overall.gpa !== null) facts.gpa = row.overall.gpa
  if (row.overall.label !== null) facts.grade = row.overall.label
  return facts
}
