import { describe, it, expect, vi, beforeEach } from 'vitest'

// #676: every exam child action asks the class guard before it writes. One
// recording stand-in for the server client: a teacher attached to a class that
// is not the exam's must get the refusal and cause no write and no RPC beyond
// the guard's own; the Owner (school-wide) must reach the write as before.

const state = { scope: 'attached' as string, writes: [] as string[] }
const GUARD_RPCS = new Set(['app_class_scope', 'staff_capacity_for_class_offering', 'app_current_employee_id'])

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'limit', 'order', 'is']) b[m] = () => b
  for (const m of ['insert', 'upsert', 'update', 'delete'])
    b[m] = () => {
      state.writes.push(`${table}.${m}`)
      return b
    }
  const row: Record<string, unknown> = {
    exams: { class_id: 'other' },
    exam_combination_members: { exam_id: 'exam-1' },
    class_offerings: { name: '6', section: 'A' },
    subjects: { theory_marks: 100, mcq_marks: 0, practical_marks: 0 },
  }
  b.maybeSingle = async () => ({ data: row[table] ?? null, error: null })
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [{ id: 'x' }], error: null })
  return b
}

const client = {
  from: (table: string) => builder(table),
  rpc: async (fn: string) => {
    if (fn === 'app_class_scope') return { data: state.scope, error: null }
    if (!GUARD_RPCS.has(fn)) state.writes.push(`rpc.${fn}`)
    return { data: null, error: null }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/i18n-server', () => ({ currentLang: async () => 'en' }))
vi.mock('@/app/school/students/actions', () => ({
  archiveStudent: async () => {
    state.writes.push('archiveStudent')
    return {}
  },
}))

import { t } from '@/lib/i18n'
import { addRoutineEntry, removeRoutineEntry } from '@/app/school/exams/[id]/routine/actions'
import {
  generateSeatPlan,
  generateSeatPlanFor,
  publishSeatPlan,
  removeSeatPlanRow,
  saveSeatPlanRow,
} from '@/app/school/exams/[id]/seat-plan/actions'
import { saveMarks } from '@/app/school/exams/[id]/marks-entry/actions'
import { saveCocurricularMarks } from '@/app/school/exams/[id]/cocurricular/actions'
import { makeOldStudents, promoteStudents, setClassFinal } from '@/app/school/exams/[id]/promotion/actions'
import { addCombinationMember, removeCombinationMember } from '@/app/school/exams/combinations/actions'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const routine = form({ subject_id: 's', exam_date: '2026-01-01', start_time: '09:00', end_time: '10:00' })
const seat = form({ room_id: 'r', roll_start: '1', roll_end: '5' })
const member = form({ combination_id: 'c', exam_id: 'exam-1' })

const actions: [string, () => Promise<{ error?: string }>][] = [
  ['routine: addRoutineEntry', () => addRoutineEntry('exam-1', routine)],
  ['routine: removeRoutineEntry', () => removeRoutineEntry('exam-1', 'row')],
  ['seat plan: saveSeatPlanRow', () => saveSeatPlanRow('exam-1', seat)],
  ['seat plan: removeSeatPlanRow', () => removeSeatPlanRow('exam-1', 'row')],
  ['seat plan: generateSeatPlan', () => generateSeatPlan('exam-1')],
  ['seat plan: generateSeatPlanFor', () => generateSeatPlanFor('exam-1', ['exam-2'], ['r'])],
  ['seat plan: publishSeatPlan', () => publishSeatPlan('exam-1')],
  ['marks: saveMarks', () => saveMarks('exam-1', 's', [{ studentId: 'st', theory: '50', mcq: '', practical: '' }])],
  ['co-curricular: saveCocurricularMarks', () => saveCocurricularMarks('exam-1', [{ studentId: 'st', itemId: 'i', checked: true }])],
  ['promotion: promoteStudents', () => promoteStudents('exam-1', 'target', [{ studentId: 'st', newRoll: 1 }])],
  ['promotion: makeOldStudents', () => makeOldStudents('exam-1', ['st'])],
  ['promotion: setClassFinal', () => setClassFinal('exam-1', 'other', true)],
  ['combinations: addCombinationMember', () => addCombinationMember(member)],
  ['combinations: removeCombinationMember', () => removeCombinationMember('m')],
]

beforeEach(() => {
  state.writes = []
})

describe.each(actions)('%s', (_name, run) => {
  it('refuses a teacher of another class and writes nothing', async () => {
    state.scope = 'attached'
    expect(await run()).toEqual({ error: t('exams.notYourClass', 'en') })
    expect(state.writes).toEqual([])
  })

  it('still reaches its write for the School Owner and office staff', async () => {
    state.scope = 'school-wide'
    expect((await run()).error).toBeUndefined()
    expect(state.writes.length).toBeGreaterThan(0)
  })
})
