import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { createWorkflowEngine } from '@/lib/engines/workflow/engine'
import { startLeaveApproval } from '@/lib/school/leave-approval'

// Leave approval via Workflow (#271): approving the workflow syncs the leave's
// status column (which the attendance SQL reads), without touching that SQL.
describe('leave approval via Workflow (#264 cutover)', () => {
  let owner: SupabaseClient
  let schoolA: string
  let studentId: string
  let leaveId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    await owner.from('students').delete().eq('full_name', 'Leave WF Student')
    studentId = (await owner.from('students').insert({ full_name: 'Leave WF Student', class_name: 'Six' }).select('id').single()).data!.id
    leaveId = (await owner
      .from('student_leaves')
      .insert({ student_id: studentId, from_day: '2026-03-01', to_day: '2026-03-03' })
      .select('id')
      .single()).data!.id
  })

  afterAll(async () => {
    await owner.from('student_leaves').delete().eq('id', leaveId)
    await owner.from('students').delete().eq('id', studentId)
  })

  it('starts pending and becomes approved when the workflow is approved', async () => {
    const before = (await owner.from('student_leaves').select('status').eq('id', leaveId).single()).data!
    expect(before.status).toBe('pending')

    const instanceId = await startLeaveApproval(owner, { leaveId, schoolId: schoolA, type: 'student_leave' })
    await createWorkflowEngine(owner).actions.approve(instanceId, '')

    const after = (await owner.from('student_leaves').select('status').eq('id', leaveId).single()).data!
    expect(after.status).toBe('approved') // synced by the workflow → leave trigger
  })
})
