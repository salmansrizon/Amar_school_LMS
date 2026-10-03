'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { screenGrantDenied } from '@/lib/auth/require-grant'
import { createClient } from '@/lib/supabase/server'
import { absentFineAmount, settleFee } from '@/lib/fees'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

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
  const fee = amount(formData.get('fee_amount'))
  const entered = {
    pay_amount: amount(formData.get('pay_amount')),
    fine_amount: amount(formData.get('fine_amount')),
    adjust_amount: amount(formData.get('adjust_amount')),
  }
  if ([fee, ...Object.values(entered)].some(Number.isNaN)) {
    return { error: 'Amounts must be non-negative numbers' }
  }
  // The due amount is worked out here from the same figures the form previewed
  // (lib/fees.ts), not read from the request: the record posts to the ledger,
  // and "due" was the one stored figure the browser alone decided. Receiving
  // more than the total payable needs the operator's explicit advance-payment
  // acknowledgement from the review step.
  const { due, overpaid } = settleFee({
    fee,
    fine: entered.fine_amount,
    adjust: entered.adjust_amount,
    received: entered.pay_amount,
  })
  if (overpaid > 0 && formData.get('overpay_ack') !== '1') {
    return { error: t('fees.overpayNeedsAck', await currentLang()) }
  }
  const amounts = { ...entered, due_amount: due }
  const method = String(formData.get('payment_method') ?? 'cash')
  // Optional free-text note (ui/school-owner/fee-collection.html); empty
  // string normalizes to null rather than storing a blank note.
  const noteRaw = String(formData.get('note') ?? '').trim()
  const note = noteRaw || null

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }
  const denied = await screenGrantDenied(supabase, 'fees')
  if (denied) return denied

  if (editId) {
    const { data, error } = await supabase
      .from('fee_collection_records')
      .update({ ...amounts, payment_method: method, note })
      .eq('id', editId)
      .select('id')
    if (error) return { error: error.message }
    if (!data?.length) return { error: 'Record not found or not accessible' }
    revalidatePath('/school/fees')
    return { savedId: editId }
  }

  const { data, error } = await supabase
    .from('fee_collection_records')
    .insert({ student_id: studentId, month, year, ...amounts, payment_method: method, note })
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

// Absent-fine calculator (issue #34, PRD §5.6): absent working days come from
// the absent_working_days_in_month RPC (0039), which walks is_absent_working_day
// (0021, the absence-SMS feature's shared definition) day by day — the fine
// arithmetic itself (days × rate) is the one pure piece, kept in lib/fees.ts.
export type CalculateFineResult = { error?: string; absentDays?: number; fineAmount?: number }

export async function calculateAbsentFine(
  studentId: string,
  year: number,
  month: number,
  ratePerDay: number,
): Promise<CalculateFineResult> {
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase.rpc('absent_working_days_in_month', {
    p_student: studentId,
    p_year: year,
    p_month: month,
  })
  if (error) return { error: error.message }

  const absentDays = Number(data)
  return { absentDays, fineAmount: absentFineAmount(absentDays, ratePerDay) }
}
