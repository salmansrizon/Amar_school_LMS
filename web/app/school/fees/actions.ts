'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// One record per student per month is DB-enforced (unique constraint).
// The action implements legacy's "already have a payment info, please edit":
// a duplicate insert hands back the existing record id for the edit flow.

export type SaveFeeResult = { error?: string; existingId?: string; savedId?: string }

function amount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '0').trim() || 0)
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN
}

export async function saveFeeRecord(formData: FormData): Promise<SaveFeeResult> {
  const studentId = String(formData.get('student_id') ?? '')
  const month = Number(formData.get('month'))
  const year = Number(formData.get('year'))
  const editId = String(formData.get('edit_id') ?? '')
  const amounts = {
    pay_amount: amount(formData.get('pay_amount')),
    fine_amount: amount(formData.get('fine_amount')),
    adjust_amount: amount(formData.get('adjust_amount')),
    due_amount: amount(formData.get('due_amount')),
  }
  if (Object.values(amounts).some(Number.isNaN)) {
    return { error: 'Amounts must be non-negative numbers' }
  }
  const method = String(formData.get('payment_method') ?? 'cash')

  const supabase = await createClient()

  if (editId) {
    const { data, error } = await supabase
      .from('fee_collection_records')
      .update({ ...amounts, payment_method: method })
      .eq('id', editId)
      .select('id')
    if (error) return { error: error.message }
    if (!data?.length) return { error: 'Record not found or not accessible' }
    revalidatePath('/school/fees')
    return { savedId: editId }
  }

  const { data, error } = await supabase
    .from('fee_collection_records')
    .insert({ student_id: studentId, month, year, ...amounts, payment_method: method })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      // Legacy behavior: redirect to editing the existing record.
      const { data: existing } = await supabase
        .from('fee_collection_records')
        .select('id')
        .eq('student_id', studentId)
        .eq('month', month)
        .eq('year', year)
        .single()
      if (existing) return { existingId: existing.id }
    }
    return { error: error.message }
  }
  revalidatePath('/school/fees')
  return { savedId: data.id }
}
