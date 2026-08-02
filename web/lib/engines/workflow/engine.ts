// Workflow engine implementation (map #258, #264). Thin client over the SQL
// RPCs (workflow_start / workflow_decide / workflow_comment) — approver
// authority, sequential advancement, event enqueue and audit all happen
// transactionally in the database. The approverId in the seam actions is derived
// server-side from auth.uid(); it is accepted for interface symmetry.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowEngine, WorkflowStatus } from './index'

export function createWorkflowEngine(client: SupabaseClient): WorkflowEngine {
  async function decide(instanceId: string, decision: 'approved' | 'rejected', comment?: string) {
    const { error } = await client.rpc('workflow_decide', {
      p_instance_id: instanceId,
      p_decision: decision,
      p_comment: comment ?? null,
    })
    if (error) throw new Error(`workflow_decide failed: ${error.message}`)
  }

  return {
    async start(input) {
      const { data, error } = await client.rpc('workflow_start', {
        p_definition_key: input.definitionKey,
        p_school_id: input.schoolId,
        p_entity_type: input.entityType,
        p_entity_id: input.entityId,
        p_payload: input.payload ?? {},
      })
      if (error) throw new Error(`workflow_start failed: ${error.message}`)
      return { instanceId: data as string, status: 'in_progress' }
    },
    actions: {
      approve: (instanceId, _approverId, comment) => decide(instanceId, 'approved', comment),
      reject: (instanceId, _approverId, comment) => decide(instanceId, 'rejected', comment),
    },
    async status(instanceId) {
      const { data } = await client
        .from('workflow_instances')
        .select('status')
        .eq('id', instanceId)
        .single()
      return (data?.status ?? 'cancelled') as WorkflowStatus
    },
  }
}

/** Add a comment to a workflow instance (visible-tenant members). */
export async function addWorkflowComment(
  client: SupabaseClient,
  instanceId: string,
  body: string,
): Promise<void> {
  const { error } = await client.rpc('workflow_comment', { p_instance_id: instanceId, p_body: body })
  if (error) throw new Error(`workflow_comment failed: ${error.message}`)
}
