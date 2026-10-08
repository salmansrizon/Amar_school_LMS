import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, signedIn } from '../helpers/auth'
import { toVerifyModel } from '@/lib/print-verify'

// Written for migration 0260 (print verification) — NOT RUN. The migration is
// not applied, and the integration suite writes to a shared database. Run it
// once 0260 is in: `npx vitest run tests/integration/print-verification.test.ts`.
//
// Seam: print_document_facts(), the one function a QR scan calls, as an
// anonymous visitor would call it. What must hold: the right token + reference
// returns the allow-listed facts and nothing else; every wrong combination
// returns null and looks the same; another school's record is never reachable
// with this school's token; unpublished results carry no result keys; a
// voided receipt carries no amount.

const NO_SUCH_TOKEN = '0'.repeat(32)
const NO_SUCH_REF = '00000000-0000-4000-8000-000000000000'

describe('print verification — print_document_facts (0260, NOT RUN)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  const anon = anonClient()

  let schoolTokenA: string
  let studentToken: string
  let otherStudentToken: string
  let classId: string
  let examId: string
  let examB: string
  let feeId: string
  let feeOfOther: string

  const facts = async (kind: string, token: string, ref: string | null = null) => {
    const { data, error } = await anon.rpc('print_document_facts', { p_kind: kind, p_token: token, p_ref: ref })
    expect(error).toBeNull()
    return data as Record<string, unknown> | null
  }

  async function cleanup(client: SupabaseClient) {
    await client.from('exams').delete().like('name', 'PV Test%')
    await client.from('grading_schemes').delete().like('name', 'PV Test%')
    await client.from('students').delete().like('full_name', 'PV Test%')
    await client.from('class_offerings').delete().like('name', 'PV Test%')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup(ownerA)
    await cleanup(ownerB)

    schoolTokenA = (await ownerA.from('schools').select('public_token').single()).data!.public_token

    classId = (await ownerA.from('class_offerings').insert({ name: 'PV Test Class', section: 'A' }).select('id').single()).data!.id
    const subjectId = (
      await ownerA.from('subjects').insert({ class_id: classId, name: 'PV Test Subject', theory_marks: 100 }).select('id').single()
    ).data!.id
    const schemeId = (
      await ownerA
        .from('grading_schemes')
        .insert({ name: 'PV Test Scheme', scheme_type: 'letter', pass_mark_percent: 33, pass_rule_strategy: 'individual' })
        .select('id')
        .single()
    ).data!.id
    await ownerA.from('grade_bands').insert({ grading_scheme_id: schemeId, label: 'Pass', min_percent: 33, max_percent: 100 })

    const student = async (name: string, roll: number) => {
      const row = (
        await ownerA
          .from('students')
          .insert({ full_name: name, class_name: 'PV Test Class', section: 'A', roll_number: roll, guardian_name: 'PV Guardian', guardian_mobile: '01700000000' })
          .select('id, public_token')
          .single()
      ).data!
      await ownerA.rpc('admit_student_enrollment', { p_student_id: row.id, p_class_offering_id: classId, p_roll_number: roll, p_note: null })
      return row
    }
    const one = await student('PV Test Student One', 1)
    const two = await student('PV Test Student Two', 2)
    studentToken = one.public_token
    otherStudentToken = two.public_token

    examId = (
      await ownerA
        .from('exams')
        .insert({ name: 'PV Test Exam', exam_year: 2026, class_id: classId, grading_scheme_id: schemeId })
        .select('id')
        .single()
    ).data!.id
    await ownerA.from('exam_marks').insert({ exam_id: examId, student_id: one.id, subject_id: subjectId, theory_obtained: 90 })

    examB = (await ownerB.from('exams').insert({ name: 'PV Test Exam B', exam_year: 2026 }).select('id').single()).data!.id

    feeId = (
      await ownerA.from('fee_collection_records').insert({ student_id: one.id, month: 5, year: 2099, pay_amount: 500 }).select('id').single()
    ).data!.id
    feeOfOther = (
      await ownerA.from('fee_collection_records').insert({ student_id: two.id, month: 5, year: 2099, pay_amount: 700 }).select('id').single()
    ).data!.id
  })

  afterAll(async () => {
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('anon gets the admit-card facts with the right token + exam, and only the allow-listed keys', async () => {
    const data = await facts('admit_card', studentToken, examId)
    expect(data).toMatchObject({
      kind: 'admit_card',
      valid: true,
      student_name: 'PV Test Student One',
      class_name: 'PV Test Class',
      section: 'A',
      roll_number: 1,
      exam_name: 'PV Test Exam',
      exam_year: 2026,
    })
    expect(Object.keys(data!).sort()).toEqual(
      ['class_name', 'exam_name', 'exam_year', 'kind', 'reason', 'roll_number', 'school_logo_path', 'school_name', 'section', 'student_name', 'valid'].sort(),
    )
    const text = JSON.stringify(data)
    expect(text).not.toContain('PV Guardian')
    expect(text).not.toContain('01700000000')
    expect(text).not.toContain(studentToken)
  })

  it('wrong token, wrong ref, missing ref, unknown kind and malformed token all return null', async () => {
    expect(await facts('admit_card', NO_SUCH_TOKEN, examId)).toBeNull()
    expect(await facts('admit_card', studentToken, NO_SUCH_REF)).toBeNull()
    expect(await facts('admit_card', studentToken, null)).toBeNull()
    expect(await facts('no_such_kind', studentToken, examId)).toBeNull()
    expect(await facts('admit_card', studentToken.toUpperCase(), examId)).toBeNull()
    // A school token is not a student token and the other way round.
    expect(await facts('admit_card', schoolTokenA, examId)).toBeNull()
    expect(await facts('seat_plan', studentToken, examId)).toBeNull()
    // A kind that takes no reference refuses one.
    expect(await facts('student_log', studentToken, examId)).toBeNull()
  })

  it("another school's exam with this school's tokens returns null", async () => {
    expect(await facts('admit_card', studentToken, examB)).toBeNull()
    expect(await facts('mark_sheet', studentToken, examB)).toBeNull()
    expect(await facts('seat_plan', schoolTokenA, examB)).toBeNull()
    expect(await facts('exam_routine', schoolTokenA, examB)).toBeNull()
  })

  it("another student's fee record with this student's token returns null", async () => {
    expect(await facts('fee_receipt', studentToken, feeOfOther)).toBeNull()
    expect(await facts('fee_receipt', otherStudentToken, feeId)).toBeNull()
  })

  it('unpublished exam: not valid, and no result keys at all', async () => {
    const data = await facts('mark_sheet', studentToken, examId)
    expect(data).toMatchObject({ valid: false, reason: 'unpublished', exam_name: 'PV Test Exam' })
    expect(data).not.toHaveProperty('results')
    expect(JSON.stringify(data)).not.toContain('90')
    expect(toVerifyModel('mark_sheet', data)!.facts).not.toHaveProperty('totalObtained')
  })

  it('published exam: total marks only, nothing per subject and no grading scheme', async () => {
    await ownerA.from('exams').update({ results_published_at: new Date().toISOString() }).eq('id', examId)
    const data = await facts('progress_report', studentToken, examId)
    expect(data).toMatchObject({ valid: true, reason: null })
    expect(data!.results).toEqual({ complete: true, total_obtained: 90, total_full: 100 })
    const text = JSON.stringify(data)
    for (const never of ['PV Test Subject', 'PV Test Scheme', 'scheme', 'subjects', 'bands', 'Pass'])
      expect(text).not.toContain(never)

    const model = toVerifyModel('progress_report', data)!
    expect(model.facts).toMatchObject({ totalObtained: 90, totalFull: 100 })
    expect(model.changedAt).not.toBeNull()

    // The student with no mark row in it is on the roster but not complete.
    const other = await facts('mark_sheet', otherStudentToken, examId)
    expect(other!.results).toEqual({ complete: false })
    expect(toVerifyModel('mark_sheet', other)!.facts.incomplete).toBe(true)
    await ownerA.from('exams').update({ results_published_at: null }).eq('id', examId)
  })

  it('fee receipt: amount and date while active; voided shows the void date and no amount', async () => {
    const paid = await facts('fee_receipt', studentToken, feeId)
    expect(paid).toMatchObject({ valid: true, month: 5, year: 2099, amount: 500 })
    expect(paid).toHaveProperty('paid_at')

    await ownerA.from('fee_collection_records').update({ void_at: new Date().toISOString(), void_reason: 'PV test' }).eq('id', feeId)
    const voided = await facts('fee_receipt', studentToken, feeId)
    expect(voided).toMatchObject({ valid: false, reason: 'voided' })
    expect(voided).toHaveProperty('void_at')
    expect(voided).not.toHaveProperty('amount')
    expect(voided).not.toHaveProperty('paid_at')
  })

  it('whole-class and exam documents name the class or exam, never a student', async () => {
    const seat = await facts('seat_plan', schoolTokenA, examId)
    expect(Object.keys(seat!).sort()).toEqual(['exam_name', 'exam_year', 'kind', 'school_logo_path', 'school_name', 'valid'])
    const routine = await facts('class_routine', schoolTokenA, classId)
    expect(routine).toMatchObject({ valid: true, class_name: 'PV Test Class', section: 'A' })
    expect(JSON.stringify([seat, routine])).not.toContain('PV Test Student')
    expect(await facts('class_routine', schoolTokenA, null)).toBeNull()
    // The attendance book over several classes is the one list with no class.
    expect(Object.keys((await facts('attendance_book', schoolTokenA, null))!).sort()).toEqual(['kind', 'school_logo_path', 'school_name', 'valid'])
    expect(Object.keys((await facts('template_homework', schoolTokenA, null))!).sort()).toEqual(['kind', 'school_logo_path', 'school_name', 'valid'])
  })

  it('an archived student is not valid', async () => {
    await ownerA.from('students').update({ archived_at: new Date().toISOString() }).like('full_name', 'PV Test Student Two')
    expect(await facts('student_log', otherStudentToken)).toMatchObject({ valid: false, reason: 'archived' })
    expect(await facts('admit_card', otherStudentToken, examId)).toMatchObject({ valid: false, reason: 'archived' })
  })

  it('print_tokens_self is not callable by anon, and print_document_facts is', async () => {
    const { error } = await anon.rpc('print_tokens_self')
    expect(error).not.toBeNull()
    const { error: ok } = await anon.rpc('print_document_facts', { p_kind: 'id_cards', p_token: schoolTokenA })
    expect(ok).toBeNull()
  })
})
