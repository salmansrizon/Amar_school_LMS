'use server'

import { revalidatePath } from 'next/cache'
import { getAgentContext } from '@/lib/agent/context'

// Toggle an assigned task open/done. RLS ("assignee updates own task", 0109)
// restricts the update to the agent's own tasks.
export async function setTaskStatus(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getAgentContext()
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  if (status !== 'open' && status !== 'done') return { error: 'Invalid status.' }

  const { error } = await supabase.from('partner_tasks').update({ status }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/agent')
  revalidatePath('/agent/tasks')
  revalidatePath(`/agent/tasks/${id}`)
  return {}
}
