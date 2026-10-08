'use server'

import { revalidatePath } from 'next/cache'
import { GRANTABLE_SCREENS } from '@/lib/auth/screens'
import { createClient } from '@/lib/supabase/server'
import { changeStaffLogin } from '@/lib/staff-login'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

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
  revalidatePath('/school/staff') // the list's per-row grant summary
  return {}
}

/** Turn one Staff User login off or on (#688). The database function is Owner
 *  only and deletes nothing: grants and the employee link stay, so "on" gives
 *  back the same access. Until migration 0241 is applied it answers
 *  "not available yet". */
export async function setStaffLoginDisabled(staffUserId: string, disabled: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const result = await changeStaffLogin(supabase, staffUserId, disabled)
  if (result !== 'ok') {
    const lang = await currentLang()
    return { error: t(result === 'unavailable' ? 'staff.loginToggleUnavailable' : 'staff.loginToggleFailed', lang) }
  }
  revalidatePath(`/school/staff/${staffUserId}`)
  revalidatePath('/school/staff')
  return {}
}
