// Leave approval via the Workflow engine (map #258, #264/#271). Starting a leave
// workflow and approving it syncs student_leaves/employee_leaves.status through
// the 0105 trigger — so the attendance-correctness SQL keeps working unchanged.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createWorkflowEngine } from '@/lib/engines/workflow/engine'

/** Open a leave-approval workflow for a leave record. */
export async function startLeaveApproval(
  client: SupabaseClient,
  input: { leaveId: string; schoolId: string; type: 'student_leave' | 'employee_leave' },
): Promise<string> {
  const { instanceId } = await createWorkflowEngine(client).start({
    definitionKey: 'leave_approval',
    schoolId: input.schoolId,
    initiatorId: '',
    entityType: input.type,
    entityId: input.leaveId,
  })
  return instanceId
}
