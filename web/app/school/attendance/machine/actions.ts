'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSchoolContext } from '@/lib/school/context'
import { employeeAttendanceAdminDenied } from '@/lib/school/employee-attendance-admin'
import { parseMachineInput } from '@/lib/machine-attendance'
import {
  createMachine,
  deleteMachine,
  saveRfidEntries,
  updateMachine,
  type RfidEntry,
  type RfidSaveResult,
} from '@/lib/machine-enrollment-store'

// Machine Attendance (issue #675). RLS is the authority on who may write:
// attendance_machines and machine_enroll_infos are School-scoped and behind
// the Attendance grant (0211/0213). These actions validate shape and pass the
// caller's own client to the store.

const SETUP_PAGE = '/school/attendance/machine'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// The client queue sends at most 25 per batch; anything far larger is not
// from this screen.
const MAX_BATCH = 50

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '')
}

/** Create (id null) or edit a machine. Shift is re-checked against the
 *  caller's own School's configured Shifts, not just the 4-value vocabulary. */
export async function saveMachineAction(id: string | null, formData: FormData): Promise<{ error?: string }> {
  if (id !== null && !UUID.test(id)) return { error: 'errNotFound' }
  const { configuredShifts } = await getSchoolContext()
  const parsed = parseMachineInput(
    {
      machine_type: field(formData, 'machine_type'),
      model: field(formData, 'model'),
      serial_number: field(formData, 'serial_number'),
      location: field(formData, 'location'),
      shift: field(formData, 'shift'),
      note: field(formData, 'note'),
    },
    configuredShifts,
  )
  if ('error' in parsed) return parsed
  const supabase = await createClient()
  // #677: Owner and office staff only (RLS repeats this once 0240 is applied).
  const denied = await employeeAttendanceAdminDenied(supabase)
  if (denied) return denied
  const result = id === null ? await createMachine(supabase, parsed) : await updateMachine(supabase, id, parsed)
  if (!result.error) revalidatePath(SETUP_PAGE)
  return result
}

export async function deleteMachineAction(id: string): Promise<{ error?: string }> {
  if (!UUID.test(id)) return { error: 'errNotFound' }
  const supabase = await createClient()
  // #677: Owner and office staff only (RLS repeats this once 0240 is applied).
  const denied = await employeeAttendanceAdminDenied(supabase)
  if (denied) return denied
  const result = await deleteMachine(supabase, id)
  if (!result.error) revalidatePath(SETUP_PAGE)
  return result
}

/** One batch from the RFID entry queue. Never throws for a business outcome —
 *  every entry gets its own result — so a thrown error here always means the
 *  request itself failed, which the client queue retries. No revalidatePath:
 *  the screen already shows what was typed, and re-rendering it mid-scan
 *  would fight the operator's focus. */
export async function saveRfidEntriesAction(entries: RfidEntry[]): Promise<RfidSaveResult[]> {
  if (!Array.isArray(entries) || entries.length > MAX_BATCH) return []
  const valid: RfidEntry[] = []
  const results: RfidSaveResult[] = []
  for (const e of entries) {
    const personId = typeof e?.personId === 'string' ? e.personId : ''
    if (
      (e?.kind === 'student' || e?.kind === 'employee') &&
      UUID.test(personId) &&
      (e.card === null || typeof e.card === 'string')
    ) {
      valid.push({ kind: e.kind, personId, card: e.card })
    } else if (personId) {
      results.push({ personId, ok: false, error: 'invalid' })
    }
  }
  if (!valid.length) return results
  const supabase = await createClient()
  // #677: refused callers get a per-entry failure, the shape the queue expects.
  if (await employeeAttendanceAdminDenied(supabase)) {
    return [...results, ...valid.map((e) => ({ personId: e.personId, ok: false as const, error: 'failed' as const }))]
  }
  return [...results, ...(await saveRfidEntries(supabase, valid))]
}
