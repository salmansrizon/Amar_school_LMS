import type { SupabaseClient } from '@supabase/supabase-js'
import { schoolToday } from '@/lib/school-time'

// "Machine not synced" signal (#694, #703 item 4.2) — READ SIDE ONLY.
//
// The signal is the Windows Attendance Agent's heartbeat (ADR 0033):
// attendance_agents.last_heartbeat_at, added by 0216 and written by the
// agent_heartbeat RPC of a later phase. No column of our own is added. Until
// an Agent has sent a heartbeat the value is null, and until 0216 is applied
// the view does not exist: both read as "unknown", and the pages then show
// nothing new.

/** Latest heartbeat of the School's active Agents, or null when unknown. */
export async function loadLastAgentHeartbeat(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('attendance_agents_safe')
    .select('last_heartbeat_at')
    .eq('status', 'active')
    .not('last_heartbeat_at', 'is', null)
    .order('last_heartbeat_at', { ascending: false })
    .limit(1)
  if (error || !Array.isArray(data)) return null
  const value = data[0]?.last_heartbeat_at
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
}

/**
 * Pure: should a "no record" day carry the "machine has not synced" warning?
 * Yes only when a heartbeat is known and the last one fell on an EARLIER
 * School day than `day`: the Agent has not been in contact since, so that
 * day's punches cannot have arrived. A heartbeat on or after the day means
 * the Agent did report, and "no record" then really is nobody recorded.
 */
export function agentNotSyncedFor(day: string, lastHeartbeat: string | null): boolean {
  if (!lastHeartbeat) return false
  const at = new Date(lastHeartbeat)
  if (Number.isNaN(at.getTime())) return false
  return schoolToday(at) < day
}
