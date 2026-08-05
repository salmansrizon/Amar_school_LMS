'use server'

import { revalidatePath } from 'next/cache'
import { getSchoolContext } from '@/lib/school/context'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// Decide a workflow stage (#317). The audited workflow_decide RPC enforces that
// the caller is the current stage's approver (role/user) + a tenant member;
// advances the instance, records the step, emits Approval*/WorkflowCompleted.
export async function decideWorkflow(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSchoolContext()
  const instanceId = String(formData.get('instance_id') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const comment = String(formData.get('comment') ?? '').trim() || null
  if (!instanceId) return { error: 'Missing workflow.' }
  if (decision !== 'approved' && decision !== 'rejected') return { error: 'Invalid decision.' }

  const { error } = await supabase.rpc('workflow_decide', {
    p_instance_id: instanceId,
    p_decision: decision,
    p_comment: comment,
  })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/school/approvals')
  return {}
}
