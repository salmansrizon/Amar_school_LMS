import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumnError } from '@/lib/leave-columns'

// Turning a Staff User login off and on (#688). Migration 0241 adds
// profiles.login_disabled_at and set_staff_login_disabled(). Until it is
// applied both are missing, and everything here answers "unavailable" so the
// screens keep today's behaviour (same idea as attendance-rate-source.ts).

/** PostgREST "function not in the schema cache" or Postgres undefined_function. */
export function isMissingFunctionError(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
}

export type StaffLoginChange = 'ok' | 'unavailable' | 'failed'

/** Pure: what one RPC result means. */
export function staffLoginChangeFrom(error: { code?: string } | null | undefined): StaffLoginChange {
  if (!error) return 'ok'
  return isMissingFunctionError(error) ? 'unavailable' : 'failed'
}

/** Owner only — the function refuses everyone else. Deletes nothing. */
export async function changeStaffLogin(
  supabase: SupabaseClient,
  staffUserId: string,
  disabled: boolean,
): Promise<StaffLoginChange> {
  const { error } = await supabase.rpc('set_staff_login_disabled', { p_staff: staffUserId, p_disabled: disabled })
  return staffLoginChangeFrom(error)
}

/** The Staff User ids whose login is off, or null while 0241 is unapplied
 *  (callers then hide the control). The Owner reads their School's profiles. */
export async function disabledStaffLogins(supabase: SupabaseClient): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, login_disabled_at')
    .eq('role', 'staff_user')
    .not('login_disabled_at', 'is', null)
  if (isMissingColumnError(error)) return null
  if (error) return null
  return new Set((data ?? []).map((r) => r.id as string))
}

export type StaffLoginState = 'enabled' | 'disabled' | 'unavailable'

/** Pure: one login's state from the set above. */
export function staffLoginState(disabled: ReadonlySet<string> | null, staffUserId: string): StaffLoginState {
  if (!disabled) return 'unavailable'
  return disabled.has(staffUserId) ? 'disabled' : 'enabled'
}

/** Pure: does this login need the Owner's attention? Its Employee is archived
 *  and the login still works (or its state cannot be read yet). */
export function archivedEmployeeLoginActive(state: StaffLoginState, employeeArchived: boolean): boolean {
  return employeeArchived && state !== 'disabled'
}
