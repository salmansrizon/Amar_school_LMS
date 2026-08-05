'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { takaToPoisha } from '@/lib/money'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// Bill a distributor (#319) — a single-line invoice to a distributor party via
// invoice_create (p_distributor_id). RPC enforces super-admin.
export async function billDistributor(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const distributor = String(formData.get('distributor') ?? '')
  const description = String(formData.get('description') ?? '').trim()
  const incomeAccount = String(formData.get('income_account') ?? '4100')
  const unit = takaToPoisha(String(formData.get('amount') ?? ''))
  if (!distributor) return { error: 'Pick a distributor.' }
  if (!description) return { error: 'Description is required.' }
  if (unit === null) return { error: 'Amount must be a positive value.' }

  const { error } = await supabase.rpc('invoice_create', {
    p_school_id: null,
    p_distributor_id: distributor,
    p_lines: [{ description, quantity: 1, unit_amount: unit }],
    p_income_account: incomeAccount,
  })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/invoices')
  return {}
}
