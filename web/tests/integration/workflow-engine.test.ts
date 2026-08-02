import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { addWorkflowComment, createWorkflowEngine } from '@/lib/engines/workflow/engine'

// Workflow Engine (map #258, #264) against live Supabase: single-stage approve
// and reject, approver-authority enforcement, tenant isolation, multi-level
// sequential approval, comments, event enqueue, and audit.
describe('Workflow Engine (#264)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let staff: SupabaseClient
  let schoolA: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    staff = await signedIn('staff-a1@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
  })

  it('runs a single-stage approval and audits + emits completion', async () => {
    const wf = createWorkflowEngine(owner)
    const { instanceId, status } = await wf.start({
      definitionKey: 'leave_approval',
      schoolId: schoolA,
      initiatorId: '',
      entityType: 'student_leave',
      entityId: crypto.randomUUID(),
    })
    expect(status).toBe('in_progress')

    // Staff is not the approver (stage requires school_owner).
    await expect(createWorkflowEngine(staff).actions.approve(instanceId, '')).rejects.toThrow()

    await wf.actions.approve(instanceId, '', 'ok')
    expect(await wf.status(instanceId)).toBe('approved')

    const audit = (await superClient
      .from('audit_log')
      .select('action')
      .eq('entity_type', 'workflow_instance')
      .eq('entity_id', instanceId)).data ?? []
    expect(audit.some((r) => r.action === 'approve')).toBe(true)

    const completed = (await superClient
      .from('domain_events')
      .select('id')
      .eq('type', 'WorkflowCompleted')
      .filter('payload->>instanceId', 'eq', instanceId)).data ?? []
    expect(completed.length).toBeGreaterThanOrEqual(1)
  })

  it('supports rejection', async () => {
    const wf = createWorkflowEngine(owner)
    const { instanceId } = await wf.start({
      definitionKey: 'leave_approval',
      schoolId: schoolA,
      initiatorId: '',
      entityType: 'student_leave',
      entityId: crypto.randomUUID(),
    })
    await wf.actions.reject(instanceId, '', 'no')
    expect(await wf.status(instanceId)).toBe('rejected')
  })

  it('isolates instances by tenant (other tenant cannot act or read)', async () => {
    const { instanceId } = await createWorkflowEngine(owner).start({
      definitionKey: 'leave_approval',
      schoolId: schoolA,
      initiatorId: '',
      entityType: 'student_leave',
      entityId: crypto.randomUUID(),
    })
    await expect(createWorkflowEngine(ownerB).actions.approve(instanceId, '')).rejects.toThrow()
    const read = (await ownerB.from('workflow_instances').select('id').eq('id', instanceId)).data ?? []
    expect(read).toHaveLength(0)
  })

  it('accepts a comment on an instance', async () => {
    const { instanceId } = await createWorkflowEngine(owner).start({
      definitionKey: 'leave_approval',
      schoolId: schoolA,
      initiatorId: '',
      entityType: 'student_leave',
      entityId: crypto.randomUUID(),
    })
    await addWorkflowComment(owner, instanceId, 'please review')
    const rows = (await owner.from('workflow_comments').select('body').eq('instance_id', instanceId)).data ?? []
    expect(rows.some((r) => r.body === 'please review')).toBe(true)
  })

  it('advances multi-level sequential stages', async () => {
    // Temp 2-stage definition: owner then super.
    await superClient.from('workflow_definitions').insert({ key: 'test_two_stage', label: {} })
    await superClient.from('workflow_stages').insert([
      { definition_key: 'test_two_stage', seq: 1, approver_role: 'school_owner' },
      { definition_key: 'test_two_stage', seq: 2, approver_role: 'super_admin' },
    ])

    const { instanceId } = await createWorkflowEngine(owner).start({
      definitionKey: 'test_two_stage',
      schoolId: schoolA,
      initiatorId: '',
      entityType: 'test',
      entityId: crypto.randomUUID(),
    })
    // Stage 1 (owner) approves -> still in progress at stage 2.
    await createWorkflowEngine(owner).actions.approve(instanceId, '')
    expect(await createWorkflowEngine(owner).status(instanceId)).toBe('in_progress')
    // Owner is not the stage-2 approver.
    await expect(createWorkflowEngine(owner).actions.approve(instanceId, '')).rejects.toThrow()
    // Super approves stage 2 -> approved.
    await createWorkflowEngine(superClient).actions.approve(instanceId, '')
    expect(await createWorkflowEngine(superClient).status(instanceId)).toBe('approved')
  })

  it('rejects starting an unknown definition', async () => {
    await expect(
      createWorkflowEngine(owner).start({
        definitionKey: 'does_not_exist',
        schoolId: schoolA,
        initiatorId: '',
        entityType: 'x',
        entityId: 'y',
      }),
    ).rejects.toThrow()
  })

  afterAll(async () => {
    await superClient.from('workflow_definitions').delete().eq('key', 'test_two_stage')
  })
})
