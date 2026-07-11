'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { CHECKLIST_ITEMS } from '@/lib/institute'

// Administrative daily checklist (issue #39, PRD §5.11). One row per School
// per date (unique constraint) — save is an upsert, same pattern as
// category_grace_minutes / class_syllabi.

const PAGE = '/school/institute/checklist'

export async function saveChecklist(formData: FormData): Promise<{ error?: string }> {
  const checklistDate = String(formData.get('checklist_date') ?? '').trim()
  if (!checklistDate) return { error: 'Date is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const items = Object.fromEntries(
    CHECKLIST_ITEMS.map((item) => [item.key, formData.get(item.key) === 'on']),
  )

  const { error } = await supabase
    .from('daily_checklists')
    .upsert({ checklist_date: checklistDate, ...items }, { onConflict: 'school_id,checklist_date' })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
