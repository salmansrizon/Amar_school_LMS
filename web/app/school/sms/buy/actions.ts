'use server'

import { revalidatePath } from 'next/cache'
import { getSchoolContext } from '@/lib/school/context'
import { cronClient, reconcileSecret } from '@/lib/cron/job'
import { purchaseSmsPackage } from '@/lib/sms/commerce'

// School buys an SMS package (#300). The owner triggers it; the purchase itself
// runs system-side (reconcile secret) because it issues an invoice + allocates
// wallet segments (super/system-gated). The school_id comes from the server-side
// session — never the client — and the schoolId is the caller's own.
export async function buySmsPackage(formData: FormData): Promise<{ error?: string }> {
  const { role, schoolId } = await getSchoolContext()
  if (role !== 'school_owner') return { error: 'Only the school owner can buy SMS packages.' }
  const packageId = String(formData.get('package_id') ?? '')
  if (!packageId) return { error: 'Pick a package.' }

  try {
    await purchaseSmsPackage(cronClient(), { schoolId, packageId }, reconcileSecret())
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Purchase failed.' }
  }
  revalidatePath('/school/sms/buy')
  revalidatePath('/school/sms')
  return {}
}
