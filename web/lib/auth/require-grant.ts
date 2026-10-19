import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScreenKey } from '@/lib/auth/screens'
import { t } from '@/lib/i18n'
import { currentLang } from '@/lib/i18n-server'

/** Does the caller hold the Permission Grant for this screen? (#687)
 *
 *  Asks `app_module_granted` (0136) — the same function the RLS policies call,
 *  so the action and the database cannot disagree: true for the School Owner,
 *  true for a Staff User holding the grant, false for everyone else. RLS stays
 *  the authority; this is the second layer that turns a raw policy error into a
 *  clean refusal before any write is attempted. Fails closed. */
export async function requireScreenGrant(supabase: SupabaseClient, screen: ScreenKey): Promise<boolean> {
  const { data } = await supabase.rpc('app_module_granted', { p_module: screen })
  return data === true
}

/** The action-shaped form: `null` when granted, else the localized error result
 *  a server action returns as-is. */
export async function screenGrantDenied(
  supabase: SupabaseClient,
  screen: ScreenKey,
): Promise<{ error: string } | null> {
  if (await requireScreenGrant(supabase, screen)) return null
  return { error: t('denied.title', await currentLang()) }
}
