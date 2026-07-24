'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { ticksFromForm, type ActivityChecklistItem } from '@/lib/institute'

// Administrative daily checklist (issue #39, PRD §5.11) with an editable item
// template (ui.md issue 4 / #150). Items are school-scoped master data
// (activity_checklist_items); a day's tick state is a jsonb map of item id ->
// true on daily_checklists (one row per school per date). RLS scopes every
// read/write to the caller's own school.

const PAGE = '/school/institute/checklist'

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

// --- Daily tick state ---------------------------------------------------

/** Save today's ticks from the form: a checkbox named by each item id, value
 *  "on" when ticked. Stores only the ticked ids, so the map stays a clean
 *  set of what's done. */
export async function saveChecklist(formData: FormData): Promise<{ error?: string }> {
  const checklistDate = str(formData, 'checklist_date')
  if (!checklistDate) return { error: 'Date is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data: items } = await supabase.from('activity_checklist_items').select('id')
  const ticks = ticksFromForm(items ?? [], (id) => formData.get(id) === 'on')

  const { error } = await supabase
    .from('daily_checklists')
    .upsert({ checklist_date: checklistDate, ticks }, { onConflict: 'school_id,checklist_date' })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  revalidatePath('/school')
  return {}
}

// --- Item template CRUD -------------------------------------------------

function validateItem(labelBn: string, labelEn: string): string | null {
  if (!labelBn || !labelEn) return 'checklistItemLabelRequired'
  return null
}

export async function addChecklistItem(formData: FormData): Promise<{ error?: string }> {
  const labelBn = str(formData, 'label_bn')
  const labelEn = str(formData, 'label_en')
  const err = validateItem(labelBn, labelEn)
  if (err) return { error: err }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  // New items land at the bottom: one past the current max sort_order.
  const { data: last } = await supabase
    .from('activity_checklist_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = (last?.sort_order ?? -1) + 1

  const { error } = await supabase
    .from('activity_checklist_items')
    .insert({ label_bn: labelBn, label_en: labelEn, sort_order: sortOrder })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  revalidatePath('/school')
  return {}
}

export async function updateChecklistItem(formData: FormData): Promise<{ error?: string }> {
  const id = str(formData, 'id')
  const labelBn = str(formData, 'label_bn')
  const labelEn = str(formData, 'label_en')
  if (!id) return { error: 'Item id is required' }
  const err = validateItem(labelBn, labelEn)
  if (err) return { error: err }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('activity_checklist_items')
    .update({ label_bn: labelBn, label_en: labelEn })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Item not found or not accessible' }
  revalidatePath(PAGE)
  revalidatePath('/school')
  return {}
}

export async function deleteChecklistItem(id: string): Promise<{ error?: string }> {
  if (!id) return { error: 'Item id is required' }
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('activity_checklist_items')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Item not found or not accessible' }
  revalidatePath(PAGE)
  revalidatePath('/school')
  return {}
}

/** Reorder by swapping this item's sort_order with its neighbour in the given
 *  direction. Reading the full ordered list first keeps the swap correct even
 *  when sort_order values aren't contiguous. */
export async function moveChecklistItem(id: string, dir: 'up' | 'down'): Promise<{ error?: string }> {
  if (!id) return { error: 'Item id is required' }
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data: rows, error: listErr } = await supabase
    .from('activity_checklist_items')
    .select('id, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (listErr) return { error: listErr.message }
  const items = (rows ?? []) as Pick<ActivityChecklistItem, 'id' | 'sort_order'>[]

  const index = items.findIndex((r) => r.id === id)
  if (index === -1) return { error: 'Item not found or not accessible' }
  const swapIndex = dir === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= items.length) return {} // already at the edge

  const a = items[index]
  const b = items[swapIndex]
  // Swap their sort_order values. Two updates; sort_order isn't unique so no
  // transient-collision worry.
  const [r1, r2] = await Promise.all([
    supabase.from('activity_checklist_items').update({ sort_order: b.sort_order }).eq('id', a.id),
    supabase.from('activity_checklist_items').update({ sort_order: a.sort_order }).eq('id', b.id),
  ])
  if (r1.error) return { error: r1.error.message }
  if (r2.error) return { error: r2.error.message }
  revalidatePath(PAGE)
  revalidatePath('/school')
  return {}
}
