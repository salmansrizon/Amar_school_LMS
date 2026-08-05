'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { periodValid } from '@/lib/super-admin/settlements'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// Settlement create + approve/pay (#297) — thin bridges to the audited RPCs
// (settlement_run bundles accrued commissions; settlement_approve → paid + GL
// payout + SettlementCompleted). Both RPCs enforce super-admin.
export async function runSettlement(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const distributor = String(formData.get('distributor') ?? '')
  const start = String(formData.get('period_start') ?? '')
  const end = String(formData.get('period_end') ?? '')
  if (!distributor) return { error: 'Pick a distributor.' }
  if (!periodValid(start, end)) return { error: 'Enter a valid period (start ≤ end).' }

  const { error } = await supabase.rpc('settlement_run', {
    p_distributor: distributor,
    p_period_start: start,
    p_period_end: end,
  })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/settlements')
  return {}
}

export async function approveSettlement(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const id = String(formData.get('id') ?? '')
  const { error } = await supabase.rpc('settlement_approve', { p_settlement: id })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/settlements')
  return {}
}
