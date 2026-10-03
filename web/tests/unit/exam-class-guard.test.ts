import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/i18n-server', () => ({ currentLang: async () => 'en' }))

import { examClassDenied, mayActOnExamClass } from '@/lib/school/exam-class-guard'
import { t } from '@/lib/i18n'

// #676. A stand-in for the three things the guard asks the database: the
// caller's class scope (app_class_scope), the exam's class, and the caller's
// capacity over one Class Offering (staff_capacity_for_class_offering).
function fakeClient(opts: {
  scope: 'school-wide' | 'attached' | 'none'
  examClassId?: string | null
  /** undefined = the exam row is not readable */
  examMissing?: boolean
  capacity?: Record<string, string | null>
}) {
  const rpc = vi.fn(async (fn: string, args?: { p_offering?: string }) => {
    if (fn === 'app_class_scope') return { data: opts.scope, error: null }
    if (fn === 'staff_capacity_for_class_offering')
      return { data: opts.capacity?.[args!.p_offering!] ?? null, error: null }
    throw new Error(`unexpected rpc ${fn}`)
  })
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: opts.examMissing ? null : { class_id: opts.examClassId ?? null },
          error: null,
        }),
      }),
    }),
  }))
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

  it('leaves an unreadable exam to the action’s own not-found handling', async () => {
    const { client } = fakeClient({ scope: 'attached', examMissing: true })
    expect(await mayActOnExamClass(client, 'exam-1')).toBe(true)
  })
})

describe('examClassDenied', () => {
  it('returns null when allowed', async () => {
    const { client } = fakeClient({ scope: 'school-wide' })
    expect(await examClassDenied(client, 'exam-1')).toBeNull()
  })

  it('returns the localized error result when refused — it does not throw', async () => {
    const { client } = fakeClient({ scope: 'attached', examClassId: 'other' })
    expect(await examClassDenied(client, 'exam-1')).toEqual({ error: t('exams.notYourClass', 'en') })
  })
})
