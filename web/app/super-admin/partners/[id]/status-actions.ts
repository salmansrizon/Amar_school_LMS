'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { pgErrorMessage } from '@/lib/crud/pg-error'
import { DISTRIBUTOR_STATUSES } from './statuses'

// Move a distributor through its lifecycle (#299) via the audited
// set_distributor_status RPC (emits DistributorApproved on approval). RPC enforces
// super/system.
export async function setDistributorStatus(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const distributor = String(formData.get('distributor') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!distributor) return { error: 'Missing distributor.' }
  if (!DISTRIBUTOR_STATUSES.includes(status as (typeof DISTRIBUTOR_STATUSES)[number])) {
    return { error: 'Invalid status.' }
  }
  const { error } = await supabase.rpc('set_distributor_status', {
    p_distributor: distributor,
    p_status: status,
  })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath(`/super-admin/partners/${distributor}`)
  return {}
}
