'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { CHECKLIST_ITEMS, type ChecklistItemKey } from '@/lib/institute'

// Dashboard Activity Checklist toggle (issue #117). Surfaces the same
// daily_checklists row the Institute checklist (#39) owns, so a single card
// tap on the dashboard toggles one item without submitting the whole form.
// One row per School per date (unique school_id,checklist_date) — a
// single-column upsert inserts the day's row on first tap (other items keep
// their `false` default) and merges the one column on later taps.

const CHECKLIST_KEYS = new Set<string>(CHECKLIST_ITEMS.map((i) => i.key))

export async function toggleDailyChecklist(
  checklistDate: string,
  key: string,
  done: boolean,
): Promise<{ error?: string }> {
  if (!checklistDate) return { error: 'Date is required' }
  if (!CHECKLIST_KEYS.has(key)) return { error: 'Unknown checklist item' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('daily_checklists')
    .upsert(
      { checklist_date: checklistDate, [key as ChecklistItemKey]: done },
      { onConflict: 'school_id,checklist_date' },
    )
  if (error) return { error: error.message }

  revalidatePath('/school')
  revalidatePath('/school/institute/checklist')
  return {}
}
