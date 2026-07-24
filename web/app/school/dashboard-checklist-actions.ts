'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { applyTick, type ChecklistTicks } from '@/lib/institute'

// Dashboard Activity Checklist toggle (issue #117, template model #150).
// Surfaces the same daily_checklists row the Institute checklist (#39) owns, so
// a single card tap toggles one item without submitting the whole form. One row
// per School per date (unique school_id,checklist_date); tick state is a jsonb
// map of item id -> true. A tap reads the day's current map, sets/clears the
// one item id, and upserts the merged map.

export async function toggleDailyChecklist(
  checklistDate: string,
  itemId: string,
  done: boolean,
): Promise<{ error?: string }> {
  if (!checklistDate) return { error: 'Date is required' }
  if (!itemId) return { error: 'Unknown checklist item' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  // The item id must be one of this school's template items (RLS already scopes
  // the read, so a match proves ownership).
  const { data: item } = await supabase
    .from('activity_checklist_items')
    .select('id')
    .eq('id', itemId)
    .maybeSingle()
  if (!item) return { error: 'Unknown checklist item' }

  const { data: existing } = await supabase
    .from('daily_checklists')
    .select('ticks')
    .eq('checklist_date', checklistDate)
    .maybeSingle()

  const ticks = applyTick(existing?.ticks as ChecklistTicks | null, itemId, done)

  const { error } = await supabase
    .from('daily_checklists')
    .upsert({ checklist_date: checklistDate, ticks }, { onConflict: 'school_id,checklist_date' })
  if (error) return { error: error.message }

  revalidatePath('/school')
  revalidatePath('/school/institute/checklist')
  return {}
}
