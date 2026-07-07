'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS is the authority for all of these — actions just pass through.

export async function createStaff(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_staff_user', {
    staff_email: String(formData.get('email')),
    staff_password: String(formData.get('password')),
    staff_full_name: String(formData.get('full_name')),
  })
  if (error) return { error: error.message }
  revalidatePath('/school/staff')
  return {}
}

export async function setScreenGrant(staffUserId: string, screenKey: string, granted: boolean) {
  const supabase = await createClient()
  if (granted) {
    await supabase.from('staff_permissions').insert({ staff_user_id: staffUserId, screen_key: screenKey })
  } else {
    await supabase
      .from('staff_permissions')
      .delete()
      .eq('staff_user_id', staffUserId)
      .eq('screen_key', screenKey)
  }
  revalidatePath(`/school/staff/${staffUserId}`)
}
