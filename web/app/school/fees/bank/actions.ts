'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { parseNonNegativeAmount, parsePositiveAmount } from '@/lib/accounting'

// Accounting II (issue #35, PRD §5.6): bank/cash accounts with
// deposit/withdraw and cheque tracking. The insufficient-balance guard is
// enforced by apply_bank_cash_transaction (0055) — a real DB trigger that
// locks the account row and raises an exception, not just a UI check; this
// action recognizes that specific exception and maps it to a translatable
// error code the client renders via t('bank.insufficientBalance', lang).

const PAGE = '/school/fees/bank'

export type ActionResult = { error?: string; savedId?: string }

export async function saveBankAccount(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim()
  const type = String(formData.get('type') ?? '')
  const opening = parseNonNegativeAmount(formData.get('opening_balance'))

  if (!name) return { error: 'Account name is required' }
  if (type !== 'cash' && type !== 'bank') return { error: 'Type must be cash or bank' }
  if (Number.isNaN(opening)) return { error: 'Opening balance must be a non-negative number' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('bank_cash_accounts')
    .insert({ name, type, balance: opening })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { savedId: data.id }
}

export async function recordBankTransaction(formData: FormData): Promise<ActionResult> {
  const accountId = String(formData.get('account_id') ?? '')
  const txnType = String(formData.get('txn_type') ?? '')
  const amount = parsePositiveAmount(formData.get('amount'))
  const txnDate = String(formData.get('txn_date') ?? '').trim()
  const paymentMethod = String(formData.get('payment_method') ?? 'cash') === 'cheque' ? 'cheque' : 'cash'
  const chequeNo = paymentMethod === 'cheque' ? String(formData.get('cheque_no') ?? '').trim() || null : null
  const chequeDate =
    paymentMethod === 'cheque' ? String(formData.get('cheque_date') ?? '').trim() || null : null
  const reason = String(formData.get('reason') ?? '').trim() || null

  if (!accountId) return { error: 'Account is required' }
  if (txnType !== 'deposit' && txnType !== 'withdraw') return { error: 'Invalid transaction type' }
  if (Number.isNaN(amount)) return { error: 'Amount must be a positive number' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('bank_cash_transactions')
    .insert({
      account_id: accountId,
      txn_type: txnType,
      amount,
      txn_date: txnDate || undefined,
      payment_method: paymentMethod,
      cheque_no: chequeNo,
      cheque_date: chequeDate,
      reason,
    })
    .select('id')
    .single()

  if (error) {
    if (/insufficient balance/i.test(error.message)) return { error: 'insufficient_balance' }
    return { error: error.message }
  }
  revalidatePath(PAGE)
  return { savedId: data.id }
}
