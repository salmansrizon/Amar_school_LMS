'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolOwnerProfile } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

// School-side subscription redeem (map #158, ticket #169). The owner of an
// expired school redeems a code to extend subscription_expires_at and lift the
// gate. redeem_code (0008) already permits a school_owner to redeem for their
// own school, so this just resolves the caller's school (via the auth seam) and
// calls it — no separate super-admin path.
export async function redeemOwnSubscription(code: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { ok, schoolId } = await requireSchoolOwnerProfile(supabase)
  if (!ok || !schoolId) return { error: 'Unauthorized' }

  const trimmed = code.trim()
  if (!trimmed) return { error: 'code required' }

  const { error } = await supabase.rpc('redeem_code', { code_text: trimmed, sid: schoolId })
  if (error) return { error: error.message }
  // Lift the gate: re-render the whole /school group with the new expiry.
  revalidatePath('/school', 'layout')
  return {}
}
