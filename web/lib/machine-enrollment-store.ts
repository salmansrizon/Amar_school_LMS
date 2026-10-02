import type { SupabaseClient } from '@supabase/supabase-js'
import { parseRfid, type AttendanceMachine, type MachineInput } from '@/lib/machine-attendance'

// Machine Attendance persistence (issue #675). Every function takes the
// caller's own Supabase client, so RLS decides what it can read and write:
// machine_enroll_infos and attendance_machines are School-scoped and behind
// the Attendance grant (0211/0213); students and employee_card carry their
// own existing reach.

export type EnrollmentKind = 'student' | 'employee'

export interface RfidEntry {
  kind: EnrollmentKind
  personId: string
  /** The card as entered, or null to clear it. */
  card: string | null
}

export type RfidSaveError = 'duplicate' | 'notFound' | 'invalid' | 'failed'

export type RfidSaveResult =
  | { personId: string; ok: true; card: string | null }
  | { personId: string; ok: false; error: RfidSaveError; holder?: string | null }

export interface EnrollmentInfo {
  uniqueId: number | null
  card: string | null
}

const RFID_KEY = 'machine_enroll_infos_rfid_card_number_key'
// PostgREST's .in() puts every id in the URL; keep each request well short of
// any proxy's URL limit.
const ID_CHUNK = 150

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Machine ID and current card for each person. Machine IDs come from
 *  students / employee_card (never generated here); cards from
 *  machine_enroll_infos. A person with no enrollment row has card null. */
export async function enrollmentInfo(
  supabase: SupabaseClient,
  kind: EnrollmentKind,
  personIds: readonly string[],
): Promise<Map<string, EnrollmentInfo>> {
  const out = new Map<string, EnrollmentInfo>()
  const personTable = kind === 'student' ? 'students' : 'employee_card'
  const personColumn = kind === 'student' ? 'student_id' : 'employee_id'
  await Promise.all(
    chunks(personIds, ID_CHUNK).map(async (ids) => {
      const [{ data: people }, { data: enrolled }] = await Promise.all([
        supabase.from(personTable).select('id, unique_id').in('id', ids),
        supabase.from('machine_enroll_infos').select(`${personColumn}, rfid_card_number`).in(personColumn, ids),
      ])
      const cards = new Map(
        ((enrolled ?? []) as Record<string, string | null>[]).map((r) => [r[personColumn] as string, r.rfid_card_number]),
      )
      for (const p of (people ?? []) as { id: string; unique_id: number | null }[]) {
        out.set(p.id, { uniqueId: p.unique_id, card: cards.get(p.id) ?? null })
      }
    }),
  )
  return out
}

/** Who currently holds a card in the caller's School, by name, when the
 *  caller can read that person — so a duplicate can say "already on Rahim"
 *  rather than only "already used". Null when unreadable. */
async function cardHolderName(supabase: SupabaseClient, card: string): Promise<string | null> {
  const { data } = await supabase
    .from('machine_enroll_infos')
    .select('student_id, employee_id')
    .eq('rfid_card_number', card)
    .maybeSingle()
  if (!data) return null
  const { data: person } = data.student_id
    ? await supabase.from('students').select('full_name').eq('id', data.student_id).maybeSingle()
    : await supabase.from('employee_card').select('full_name').eq('id', data.employee_id).maybeSingle()
  return (person?.full_name as string | undefined) ?? null
}

async function saveOne(
  supabase: SupabaseClient,
  entry: RfidEntry,
  uniqueIds: Map<string, number>,
): Promise<RfidSaveResult> {
  const { kind, personId } = entry
  const parsed = parseRfid(entry.card ?? '')
  if (!parsed.ok) return { personId, ok: false, error: 'invalid' }
  const card = parsed.value
  const personColumn = kind === 'student' ? 'student_id' : 'employee_id'

  if (card === null) {
    // A student's enrollment exists only to carry a card, so clearing removes
    // it. An employee stays enrolled without one (fingerprint on the machine).
    const { error } =
      kind === 'student'
        ? await supabase.from('machine_enroll_infos').delete().eq('student_id', personId)
        : await supabase.from('machine_enroll_infos').update({ rfid_card_number: null }).eq('employee_id', personId)
    return error ? { personId, ok: false, error: 'failed' } : { personId, ok: true, card: null }
  }

  const uniqueId = uniqueIds.get(personId)
  if (uniqueId === undefined) return { personId, ok: false, error: 'notFound' }

  // One row per person (machine_enroll_infos_unique_id_key), so an edit is an
  // upsert on the person's own Machine ID — never a second row.
  const { error } = await supabase.from('machine_enroll_infos').upsert(
    { type: kind, [personColumn]: personId, unique_id: uniqueId, rfid_card_number: card },
    { onConflict: 'unique_id' },
  )
  if (!error) return { personId, ok: true, card }
  if (error.code === '23505' && error.message.includes(RFID_KEY)) {
    return { personId, ok: false, error: 'duplicate', holder: await cardHolderName(supabase, card) }
  }
  return { personId, ok: false, error: 'failed' }
}

/** Saves a batch of card entries. Each entry succeeds or fails on its own;
 *  the database's per-School unique card index is the authority on
 *  duplicates. Entries in one batch are for different people (the client
 *  queue coalesces per person), so they run concurrently. */
export async function saveRfidEntries(supabase: SupabaseClient, entries: readonly RfidEntry[]): Promise<RfidSaveResult[]> {
  const uniqueIds = new Map<string, number>()
  for (const kind of ['student', 'employee'] as const) {
    const ids = entries.filter((e) => e.kind === kind && e.card !== null).map((e) => e.personId)
    if (!ids.length) continue
    const info = await enrollmentInfo(supabase, kind, ids)
    for (const [id, { uniqueId }] of info) if (uniqueId !== null) uniqueIds.set(id, uniqueId)
  }
  return Promise.all(entries.map((entry) => saveOne(supabase, entry, uniqueIds)))
}

/** Employee id -> the Shifts they work (employee_academic_shifts). */
export async function employeeShifts(supabase: SupabaseClient, employeeIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  await Promise.all(
    chunks(employeeIds, ID_CHUNK).map(async (ids) => {
      const { data } = await supabase.from('employee_academic_shifts').select('employee_id, shift').in('employee_id', ids)
      for (const r of (data ?? []) as { employee_id: string; shift: string }[]) {
        out.set(r.employee_id, [...(out.get(r.employee_id) ?? []), r.shift])
      }
    }),
  )
  return out
}

const MACHINE_COLUMNS = 'id, machine_type, model, serial_number, location, shift_scope, shift, note'

export async function listMachines(supabase: SupabaseClient): Promise<AttendanceMachine[]> {
  const { data } = await supabase.from('attendance_machines').select(MACHINE_COLUMNS).order('created_at')
  return (data ?? []) as AttendanceMachine[]
}

export type MachineWriteError = 'errSerialTaken' | 'errNotFound' | 'errSave'

function machineWriteError(error: { code?: string; message: string }): MachineWriteError {
  return error.code === '23505' && error.message.includes('attendance_machines_serial_unique') ? 'errSerialTaken' : 'errSave'
}

export async function createMachine(supabase: SupabaseClient, input: MachineInput): Promise<{ error?: MachineWriteError }> {
  const { error } = await supabase.from('attendance_machines').insert(input)
  return error ? { error: machineWriteError(error) } : {}
}

export async function updateMachine(
  supabase: SupabaseClient,
  id: string,
  input: MachineInput,
): Promise<{ error?: MachineWriteError }> {
  const { data, error } = await supabase
    .from('attendance_machines')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) return { error: machineWriteError(error) }
  return data?.length ? {} : { error: 'errNotFound' }
}

export async function deleteMachine(supabase: SupabaseClient, id: string): Promise<{ error?: MachineWriteError }> {
  const { data, error } = await supabase.from('attendance_machines').delete().eq('id', id).select('id')
  if (error) return { error: 'errSave' }
  return data?.length ? {} : { error: 'errNotFound' }
}
