import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  instanceInReach,
  instancesInReach,
  pendingApprovalsInReach,
  type ReachInstance,
  type ReachStage,
  type ReachViewer,
} from '@/lib/school/approvals-reach'

// #689: a school member sees a pending approval only when it is in their reach.
const stages: ReachStage[] = [
  { definition_key: 'leave_approval', seq: 1, approver_role: 'school_owner', approver_user: null },
  { definition_key: 'two_stage', seq: 1, approver_role: 'staff_user', approver_user: null },
  { definition_key: 'two_stage', seq: 2, approver_role: 'school_owner', approver_user: null },
  { definition_key: 'named', seq: 1, approver_role: null, approver_user: 'karim' },
]
const inst = (over: Partial<ReachInstance> = {}): ReachInstance => ({
  id: 'i1',
  definition_key: 'leave_approval',
  current_seq: 1,
  initiator_id: 'someone',
  ...over,
})
const staff = (over: Partial<ReachViewer> = {}): ReachViewer => ({
  role: 'staff_user',
  userId: 'me',
  officeAttendance: false,
  decided: new Set(),
  ...over,
})

describe('approvals reach (#689)', () => {
  it('the School Owner sees everything', () => {
    expect(instanceInReach(inst(), stages, staff({ role: 'school_owner' }))).toBe(true)
    expect(instanceInReach(inst({ definition_key: 'unknown' }), [], staff({ role: 'school_owner' }))).toBe(true)
  })

  it('a Staff User with no grant and no part in it sees nothing (the leak)', () => {
    expect(instanceInReach(inst(), stages, staff())).toBe(false)
  })

  it('the person who started it sees it', () => {
    expect(instanceInReach(inst({ initiator_id: 'me' }), stages, staff())).toBe(true)
  })

  it('an approver of the CURRENT stage sees it, by role or by name; not of another stage', () => {
    expect(instanceInReach(inst({ definition_key: 'two_stage', current_seq: 1 }), stages, staff())).toBe(true)
    expect(instanceInReach(inst({ definition_key: 'two_stage', current_seq: 2 }), stages, staff())).toBe(false)
    expect(instanceInReach(inst({ definition_key: 'named' }), stages, staff({ userId: 'karim' }))).toBe(true)
    expect(instanceInReach(inst({ definition_key: 'named' }), stages, staff())).toBe(false)
  })

  it('someone who decided an earlier stage still sees it', () => {
    const viewer = staff({ decided: new Set(['i1']) })
    expect(instanceInReach(inst({ definition_key: 'two_stage', current_seq: 2 }), stages, viewer)).toBe(true)
  })

  it('office staff with Attendance keep the attendance workflows, and only those', () => {
    const office = staff({ officeAttendance: true })
    expect(instanceInReach(inst(), stages, office)).toBe(true)
    expect(instanceInReach(inst({ definition_key: 'attendance_correction' }), stages, office)).toBe(true)
    expect(instanceInReach(inst({ definition_key: 'named' }), stages, office)).toBe(false)
  })

  it('any other role sees nothing', () => {
    expect(instanceInReach(inst({ initiator_id: 'me' }), stages, staff({ role: 'student' as ReachViewer['role'] }))).toBe(false)
  })

  it('filters a list and keeps its order', () => {
    const list = [inst({ id: 'a' }), inst({ id: 'b', initiator_id: 'me' }), inst({ id: 'c', initiator_id: 'me' })]
    expect(instancesInReach(list, stages, staff()).map((i) => i.id)).toEqual(['b', 'c'])
  })

  // The loader: who pays which queries, and that an RPC failure is not "office staff".
  function client(opts: { scope?: unknown; scopeError?: boolean; steps?: string[] }) {
    const rows = [
      { id: 'a', definition_key: 'leave_approval', current_seq: 1, initiator_id: 'x', entity_type: 'student_leave', entity_id: '1', created_at: '' },
      { id: 'b', definition_key: 'two_stage', current_seq: 2, initiator_id: 'x', entity_type: 't', entity_id: '2', created_at: '' },
    ]
    const from = vi.fn((table: string) => {
      const result =
        table === 'workflow_instances'
          ? { data: rows }
          : table === 'workflow_stages'
            ? { data: stages }
            : { data: (opts.steps ?? []).map((instance_id) => ({ instance_id })) }
      const q: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok) }
      for (const m of ['select', 'eq', 'order']) q[m] = () => q
      return q
    })
    const rpc = vi.fn(async () => (opts.scopeError ? { data: null, error: { message: 'x' } } : { data: opts.scope, error: null }))
    return { supabase: { from, rpc } as unknown as SupabaseClient, from, rpc }
  }

  it('the Owner gets every row from one query', async () => {
    const c = client({})
    const rows = await pendingApprovalsInReach(c.supabase, { role: 'school_owner', userId: 'o', grants: [] })
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(c.from).toHaveBeenCalledTimes(1)
    expect(c.rpc).not.toHaveBeenCalled()
  })

  it('office staff with Attendance get the leave queue; a teacher with the same grant does not', async () => {
    const viewer = { role: 'staff_user' as const, userId: 'me', grants: ['attendance'] }
    expect((await pendingApprovalsInReach(client({ scope: 'school-wide' }).supabase, viewer)).map((r) => r.id)).toEqual(['a'])
    expect(await pendingApprovalsInReach(client({ scope: 'attached' }).supabase, viewer)).toEqual([])
    expect(await pendingApprovalsInReach(client({ scope: 'school-wide', scopeError: true }).supabase, viewer)).toEqual([])
  })

  it('office staff without the Attendance grant get nothing; an earlier decision is kept', async () => {
    const viewer = { role: 'staff_user' as const, userId: 'me', grants: [] as string[] }
    expect(await pendingApprovalsInReach(client({ scope: 'school-wide' }).supabase, viewer)).toEqual([])
    expect((await pendingApprovalsInReach(client({ scope: 'school-wide', steps: ['b'] }).supabase, viewer)).map((r) => r.id)).toEqual(['b'])
  })
})
