import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/i18n-server', () => ({ currentLang: async () => 'en' }))

import { examClassDenied, examMarksDenied, mayActOnExamClass, mayEnterExamMarks } from '@/lib/school/exam-class-guard'
import { t } from '@/lib/i18n'

// #676. A stand-in for the three things the guard asks the database: the
// caller's class scope (app_class_scope), the exam's class, and the caller's
// capacity over one Class Offering (staff_capacity_for_class_offering).
function fakeClient(opts: {
  scope: unknown
  /** app_class_scope itself fails */
  scopeError?: boolean
  /** the caller's employees.id, and the teacher the exam names for the subject */
  employeeId?: string | null
  /** app_current_employee_id itself fails */
  employeeError?: boolean
  subjectTeacherId?: string | null
  examClassId?: string | null
  /** undefined = the exam row is not readable */
  examMissing?: boolean
  capacity?: Record<string, string | null>
}) {
  const rpc = vi.fn(async (fn: string, args?: { p_offering?: string }) => {
    if (fn === 'app_class_scope')
      return opts.scopeError ? { data: null, error: { message: 'boom' } } : { data: opts.scope, error: null }
    if (fn === 'app_current_employee_id')
      return opts.employeeError ? { data: null, error: { message: 'boom' } } : { data: opts.employeeId ?? null, error: null }
    if (fn === 'staff_capacity_for_class_offering')
      return { data: opts.capacity?.[args!.p_offering!] ?? null, error: null }
    throw new Error(`unexpected rpc ${fn}`)
  })
  const from = vi.fn((table: string) => {
    // exam_subject_teachers is filtered by teacher_id; the fake applies that one filter.
    let teacher: unknown
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        if (col === 'teacher_id') teacher = v
        return q
      },
      maybeSingle: async () => {
        if (table === 'exam_subject_teachers')
          return { data: opts.subjectTeacherId && opts.subjectTeacherId === teacher ? { id: 'a' } : null, error: null }
        return { data: opts.examMissing ? null : { class_id: opts.examClassId ?? null }, error: null }
      },
    }
    return q
  })
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from }
}

describe('mayActOnExamClass', () => {
  it('never narrows the School Owner or office staff, and asks nothing more', async () => {
    const { client, rpc, from } = fakeClient({ scope: 'school-wide', examClassId: 'other' })
    expect(await mayActOnExamClass(client, 'exam-1', 'anywhere')).toBe(true)
    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('allows the Class Teacher of the exam’s class', async () => {
    const { client } = fakeClient({ scope: 'attached', examClassId: 'mine', capacity: { mine: 'class_teacher' } })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(true)
  })

  it('allows a Subject Teacher of the exam’s class', async () => {
    const { client } = fakeClient({ scope: 'attached', examClassId: 'mine', capacity: { mine: 'subject_teacher' } })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(true)
  })

  it('refuses a teacher attached to a different class', async () => {
    const { client } = fakeClient({ scope: 'attached', examClassId: 'other', capacity: { mine: 'class_teacher' } })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(false)
  })

  it('refuses an Employee with no attachment at all', async () => {
    const { client } = fakeClient({ scope: 'none', examClassId: 'other' })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(false)
  })

  it('allows an exam that has no class yet — there is nothing to narrow by', async () => {
    const { client } = fakeClient({ scope: 'attached', examClassId: null })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(true)
  })

  it('refuses moving an exam to a class the teacher does not hold', async () => {
    const { client } = fakeClient({ scope: 'attached', examClassId: 'mine', capacity: { mine: 'class_teacher' } })
    expect(await mayActOnExamClass(client, 'exam-1', 'other')).toBe(false)
    expect(await mayActOnExamClass(client, 'exam-1', 'mine')).toBe(true)
  })

  it('refuses claiming an unassigned exam for a class the teacher does not hold', async () => {
    const { client } = fakeClient({ scope: 'attached', examClassId: null, capacity: { mine: 'class_teacher' } })
    expect(await mayActOnExamClass(client, 'exam-1', 'other')).toBe(false)
    expect(await mayActOnExamClass(client, 'exam-1', 'mine')).toBe(true)
  })

  it('refuses an exam a narrowed caller cannot read — nothing to check her class against', async () => {
    const { client } = fakeClient({ scope: 'attached', examMissing: true })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(false)
  })

  it('fails closed for a teacher when app_class_scope errors', async () => {
    const { client, from } = fakeClient({ scope: 'school-wide', scopeError: true, employeeId: 'emp-1', examClassId: null })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })

  it('lets the Owner / office staff (no employee row) through when app_class_scope errors', async () => {
    const { client, from } = fakeClient({ scope: null, scopeError: true, employeeId: null })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })

  it('refuses when both app_class_scope and the employee lookup error', async () => {
    const { client } = fakeClient({ scope: null, scopeError: true, employeeError: true })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(false)
  })

  it.each([null, undefined, '', 'owner', 42])('fails closed on an unexpected scope (%s)', async (scope) => {
    const { client } = fakeClient({ scope, examClassId: null })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(false)
  })
})

describe('examClassDenied', () => {
  it('returns null when allowed', async () => {
    const { client } = fakeClient({ scope: 'school-wide' })
    expect(await examClassDenied(client, 'exam-1')).toBeNull()
  })

  it('uses the separate message when the permission check itself failed', async () => {
    const teacher = fakeClient({ scope: null, scopeError: true, employeeId: 'emp-1' }).client
    expect(await examClassDenied(teacher, 'exam-1')).toEqual({ error: t('exams.permissionCheckFailed', 'en') })
    expect(t('exams.permissionCheckFailed', 'en')).toBe('Could not check permission. Please try again.')
  })

  it('returns the localized error result when refused — it does not throw', async () => {
    const { client } = fakeClient({ scope: 'attached', examClassId: 'other' })
    expect(await examClassDenied(client, 'exam-1')).toEqual({ error: t('exams.notYourClass', 'en') })
  })
})

describe('mayEnterExamMarks', () => {
  const otherClass = { scope: 'attached', examClassId: 'other' } as const

  it('allows whoever may act on the exam’s class, without asking who she is', async () => {
    const { client, rpc } = fakeClient({ scope: 'attached', examClassId: 'mine', capacity: { mine: 'class_teacher' } })
    expect(await mayEnterExamMarks(client, 'exam-1', 'sub-1')).toBe(true)
    expect(rpc).not.toHaveBeenCalledWith('app_current_employee_id')
  })

  it('allows the Subject Teacher the exam names for this subject, though the class is not hers', async () => {
    const { client } = fakeClient({ ...otherClass, employeeId: 'emp-1', subjectTeacherId: 'emp-1' })
    expect(await mayEnterExamMarks(client, 'exam-1', 'sub-1')).toBe(true)
    expect(await examMarksDenied(client, 'exam-1', 'sub-1')).toBeNull()
  })

  it('refuses a teacher of another class the exam names somebody else for', async () => {
    const { client } = fakeClient({ ...otherClass, employeeId: 'emp-2', subjectTeacherId: 'emp-1' })
    expect(await mayEnterExamMarks(client, 'exam-1', 'sub-1')).toBe(false)
    expect(await examMarksDenied(client, 'exam-1', 'sub-1')).toEqual({ error: t('exams.notYourClass', 'en') })
  })

  it('refuses when the caller has no employee id or the subject has no teacher', async () => {
    expect(await mayEnterExamMarks(fakeClient({ ...otherClass, subjectTeacherId: 'emp-1' }).client, 'e', 's')).toBe(false)
    expect(await mayEnterExamMarks(fakeClient({ ...otherClass, employeeId: 'emp-1' }).client, 'e', 's')).toBe(false)
  })

  it('fails closed with the class guard: a scope error is not rescued by an assignment lookup', async () => {
    const { client } = fakeClient({ scope: 'attached', scopeError: true, employeeId: 'emp-1', examClassId: 'other' })
    expect(await mayEnterExamMarks(client, 'exam-1', 'sub-1')).toBe(false)
  })
})
