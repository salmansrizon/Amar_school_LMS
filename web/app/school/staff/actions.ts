'use server'

import { revalidatePath } from 'next/cache'
import { GRANTABLE_SCREENS } from '@/lib/auth/screens'
import { createClient } from '@/lib/supabase/server'

// RLS is the authority for all of these — actions validate input and report errors.

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

export async function setScreenGrant(
  staffUserId: string,
  screenKey: string,
  granted: boolean,
): Promise<{ error?: string }> {
  if (!GRANTABLE_SCREENS.some((s) => s.key === screenKey)) {
    return { error: `unknown screen key: ${screenKey}` }
  }
  const supabase = await createClient()
  const { error } = granted
    ? await supabase
        .from('staff_permissions')
        .insert({ staff_user_id: staffUserId, screen_key: screenKey })
    : await supabase
        .from('staff_permissions')
        .delete()
        .eq('staff_user_id', staffUserId)
        .eq('screen_key', screenKey)
  if (error) return { error: error.message }
  revalidatePath(`/school/staff/${staffUserId}`)
  return {}
}
