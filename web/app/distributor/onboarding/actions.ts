'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getDistributorContext } from '@/lib/distributor/context'

// Distributor accepts an agreement version (#288). Records the legal metadata
// (IP + device) via accept_agreement, which flips the profile's agreement status.
export async function acceptAgreement(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getDistributorContext()
  const version = Number(formData.get('version'))
  if (!Number.isInteger(version)) return { error: 'Invalid version.' }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const device = h.get('user-agent') ?? null

  const { error } = await supabase.rpc('accept_agreement', { p_version: version, p_ip: ip, p_device: device })
  if (error) return { error: error.message }
  revalidatePath('/distributor/onboarding')
  return {}
}
