'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

// Accounting II (issue #35, PRD §5.6): director capital invest/withdraw with
// a running balance. The insufficient-balance guard is enforced by
// apply_director_capital_transaction (0054) — a real DB trigger, not just a
// UI check — mirroring bank/cash accounts' guard shape.

const PAGE = '/school/fees/director-capital'

export type ActionResult = { error?: string; savedId?: string }

function positiveAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '0').trim() || 0)
  return Number.isFinite(n) && n > 0 ? n : Number.NaN
}

export async function recordDirectorCapitalTransaction(formData: FormData): Promise<ActionResult> {
  const txnType = String(formData.get('txn_type') ?? '')
  const amount = positiveAmount(formData.get('amount'))
  const txnDate = String(formData.get('txn_date') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim() || null

  if (txnType !== 'invest' && txnType !== 'withdraw') return { error: 'Invalid transaction type' }
  if (Number.isNaN(amount)) return { error: 'Amount must be a positive number' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('director_capital_transactions')
    .insert({ txn_type: txnType, amount, txn_date: txnDate || undefined, note })
    .select('id')
    .single()

  if (error) {
    if (/insufficient balance/i.test(error.message)) return { error: 'insufficient_balance' }
    return { error: error.message }
  }
  revalidatePath(PAGE)
  return { savedId: data.id }
}
