import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanDecisionNote, DECISION_NOTE_MAX, isMissingColumnError, withLeaveColumns } from '@/lib/leave-columns'

describe('isMissingColumnError', () => {
  it('recognises the PostgREST and Postgres codes', () => {
    expect(isMissingColumnError({ code: 'PGRST204' })).toBe(true)
    expect(isMissingColumnError({ code: '42703' })).toBe(true)
  })
  it('recognises the message when the code is absent', () => {
    expect(isMissingColumnError({ message: "Could not find the 'decided_at' column of 'student_leaves' in the schema cache" })).toBe(true)
    expect(isMissingColumnError({ message: 'column student_leaves.decided_at does not exist' })).toBe(true)
  })
  it('ignores other errors and no error', () => {
    expect(isMissingColumnError(null)).toBe(false)
    expect(isMissingColumnError({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingColumnError({ code: '23514', message: 'violates check constraint' })).toBe(false)
  })
})

describe('withLeaveColumns', () => {
  it('retries without the new columns only on a missing-column error', async () => {
    const without = vi.fn().mockResolvedValue({ error: null, data: 'old' })
    const res = await withLeaveColumns(() => Promise.resolve({ error: { code: 'PGRST204' }, data: null }), without)
    expect(without).toHaveBeenCalledOnce()
    expect(res.data).toBe('old')

    const without2 = vi.fn()
    const real = { error: { code: '42501' }, data: null }
    expect(await withLeaveColumns(() => Promise.resolve(real), without2)).toBe(real)
    expect(without2).not.toHaveBeenCalled()
  })
})

describe('cleanDecisionNote', () => {
  it('trims, nulls empty, and clips to the CHECK length', () => {
    expect(cleanDecisionNote('  late notice ')).toBe('late notice')
    expect(cleanDecisionNote('   ')).toBeNull()
    expect(cleanDecisionNote(undefined)).toBeNull()
    expect(cleanDecisionNote('x'.repeat(DECISION_NOTE_MAX + 20))).toHaveLength(DECISION_NOTE_MAX)
  })
})

// The leave actions: what is written, and the fallback before 0216 is applied.
const updates: unknown[] = []
let failNew = false
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-role', () => ({
  requireSchoolMember: vi.fn().mockResolvedValue(true),
  requireSchoolOwnerProfile: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        updates.push(patch)
        const bad = failNew && 'decided_at' in patch
        return {
          eq: () => ({
            select: async () =>
              bad
                ? { data: null, error: { code: 'PGRST204', message: 'no column' } }
                : { data: [{ id: 'l1' }], error: null },
          }),
        }
      },
    }),
  }),
}))

describe('leave actions', () => {
  beforeEach(() => {
    updates.length = 0
    failNew = false
  })

  it('reject stores the trimmed note and a decision time; approve clears the note; revert clears both', async () => {
    const { rejectLeave, approveLeave, revertLeave } = await import('@/app/school/attendance/manual-actions')
    expect(await rejectLeave('student', 'l1', '  no cover  ')).toEqual({})
    expect(await approveLeave('student', 'l1')).toEqual({})
    expect(await revertLeave('employee', 'l1')).toEqual({})
    expect(updates[0]).toMatchObject({ status: 'rejected', decision_note: 'no cover' })
    expect(typeof (updates[0] as { decided_at: string }).decided_at).toBe('string')
    expect(updates[1]).toMatchObject({ status: 'approved', decision_note: null })
    expect(typeof (updates[1] as { decided_at: string }).decided_at).toBe('string')
    expect(updates[2]).toEqual({ status: 'pending', decided_at: null, decision_note: null })
  })

  it('reject without a note still works (no argument = old signature)', async () => {
    const { rejectLeave } = await import('@/app/school/attendance/manual-actions')
    expect(await rejectLeave('student', 'l1')).toEqual({})
    expect(updates[0]).toMatchObject({ status: 'rejected', decision_note: null })
  })

  it('falls back to a status-only update when the columns do not exist', async () => {
    failNew = true
    const { rejectLeave, approveLeave, revertLeave } = await import('@/app/school/attendance/manual-actions')
    expect(await rejectLeave('student', 'l1', 'x')).toEqual({})
    expect(await approveLeave('employee', 'l1')).toEqual({})
    expect(await revertLeave('student', 'l1')).toEqual({})
    expect(updates.filter((u) => Object.keys(u as object).join() === 'status')).toHaveLength(3)
  })
})
