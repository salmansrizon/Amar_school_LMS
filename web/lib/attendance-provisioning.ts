import type { SupabaseClient } from '@supabase/supabase-js'

// Machine Attendance provisioning (Phase 9; Baseline §14). One device-neutral
// engine for students now and employees in Phase 10. The authority is the
// definer RPC enqueue_attendance_provisioning (migration 0269): it plans each
// (person, machine) pair from the database and writes episodes and commands.
// planProvisioning below is the same rule set as a pure function, used for the
// per-device status the screens show and pinned by unit tests; the RPC's own
// answer is what an action reports.

export type ProvisionKind = 'student' | 'employee'

/** The verified capability subset provisioning depends on (attendance_machines.capabilities, Phase 6 probe). */
export interface ProvisionCapabilities {
  canWriteUsers?: boolean
  canWriteRfid?: boolean
  canDeleteUsers?: boolean
  canCreateUsersWithoutCard?: boolean
  canClearCardKeepingUser?: boolean
  maxMachineUserIdDigits?: number
  maxNameLength?: number
  supportsUnicodeNames?: boolean
  maxCardValue?: number
  cardPreservesLeadingZeros?: boolean
}

export type ProvisionReason =
  | 'errMachineNotFound'
  | 'errMachineNotInService'
  | 'errNoAgent'
  | 'errCapabilitiesUnknown'
  | 'errUnsupported'
  | 'errNotFound'
  | 'errNotEligible'
  | 'errMachineIdTooWide'
  | 'errNoCard'
  | 'errInvalidCard'
  | 'errCardClearUnsupported'
  | 'errMachineIdConflict'
  | 'errRemovalPending'
  | 'errManualRemovalRequired'
  | 'errRemovalUndecided'

export type ProvisionOutcome = 'created' | 'updated' | 'retried' | 'unchanged' | 'alreadyPending'

export const PROVISION_REASONS: readonly ProvisionReason[] = [
  'errMachineNotFound', 'errMachineNotInService', 'errNoAgent', 'errCapabilitiesUnknown', 'errUnsupported', 'errNotFound',
  'errNotEligible', 'errMachineIdTooWide', 'errNoCard', 'errInvalidCard', 'errCardClearUnsupported', 'errMachineIdConflict',
  'errRemovalPending', 'errManualRemovalRequired', 'errRemovalUndecided',
]

export interface ProvisionPerson {
  kind: ProvisionKind
  archived: boolean
  uniqueId: number | null
  fullName: string
  /** machine_enroll_infos row exists. */
  hasEnrollRow: boolean
  card: string | null
}

export interface ProvisionMachine {
  inService: boolean
  hasActiveAgent: boolean
  capabilities: ProvisionCapabilities | null
}

export interface ProvisionEpisode {
  /** The open episode is this person's (not another holder of the same device user ID). */
  samePerson: boolean
  desiredState: 'present' | 'absent'
  syncState: 'pending' | 'in_progress' | 'synced' | 'failed' | 'drift' | 'removed' | 'cancelled'
  linked: boolean
  lastSyncedCard: string | null
  lastSyncedName: string | null
  desiredVersion: number
}

export interface ProvisionCommand {
  status: string
  desiredVersion: number
  card: string | null
  name: string
}

export type ProvisionPlan =
  | { action: 'create' | 'update' | 'retry' | 'unchanged' | 'pending'; name: string }
  | { action: 'skip'; reason: ProvisionReason }

/** The card as the device will read it back (numeric devices drop leading zeros). */
export function provisionCardKey(card: string | null, preservesLeadingZeros: boolean): string | null {
  if (card === null) return null
  if (preservesLeadingZeros) return card
  return card.replace(/^0+/, '') || '0'
}

/** The name the device can hold (same rule as _provision_device_name in 0269). */
export function provisionDeviceName(fullName: string, caps: ProvisionCapabilities, fallback: string): string {
  const max = Math.max(caps.maxNameLength ?? 64, 1)
  const kept = caps.supportsUnicodeNames ? fullName : fullName.replace(/[^\x20-\x7E]/g, '')
  const name = kept.trim().replace(/\s+/g, ' ').slice(0, max).trimEnd()
  return name || fallback
}

const MAX_CARD_DIGITS = /^\d{1,20}$/

/** One (person, machine) pair, exactly as enqueue_attendance_provisioning decides it. */
export function planProvisioning(
  person: ProvisionPerson,
  machine: ProvisionMachine,
  episode: ProvisionEpisode | null,
  openCommand: ProvisionCommand | null,
): ProvisionPlan {
  const caps = machine.capabilities ?? {}
  if (!machine.inService) return { action: 'skip', reason: 'errMachineNotInService' }
  if (!machine.hasActiveAgent) return { action: 'skip', reason: 'errNoAgent' }
  if (!machine.capabilities || caps.canWriteUsers === undefined) return { action: 'skip', reason: 'errCapabilitiesUnknown' }
  if (!caps.canWriteUsers) return { action: 'skip', reason: 'errUnsupported' }
  if (person.uniqueId === null) return { action: 'skip', reason: 'errNotFound' }
  if (episode && !episode.samePerson) return { action: 'skip', reason: 'errMachineIdConflict' }
  if (episode && episode.desiredState === 'absent') return { action: 'skip', reason: 'errRemovalPending' }
  if (!person.hasEnrollRow && episode?.linked) {
    return { action: 'skip', reason: caps.canDeleteUsers ? 'errRemovalUndecided' : 'errManualRemovalRequired' }
  }
  if (person.archived || !person.hasEnrollRow) return { action: 'skip', reason: 'errNotEligible' }
  if (String(person.uniqueId).length > (caps.maxMachineUserIdDigits ?? 9)) return { action: 'skip', reason: 'errMachineIdTooWide' }
  if (person.card === null && (person.kind === 'student' || !caps.canCreateUsersWithoutCard)) {
    return { action: 'skip', reason: episode?.lastSyncedCard != null && !caps.canClearCardKeepingUser ? 'errCardClearUnsupported' : 'errNoCard' }
  }
  if (
    person.card !== null &&
    (!MAX_CARD_DIGITS.test(person.card) ||
      (caps.maxCardValue !== undefined && BigInt(person.card) > BigInt(caps.maxCardValue)) ||
      !caps.canWriteRfid)
  ) {
    return { action: 'skip', reason: 'errInvalidCard' }
  }

  const name = provisionDeviceName(person.fullName, caps, String(person.uniqueId))
  if (!episode) return { action: 'create', name }
  const preserves = caps.cardPreservesLeadingZeros ?? true
  if (
    episode.syncState === 'synced' &&
    provisionCardKey(episode.lastSyncedCard, preserves) === provisionCardKey(person.card, preserves) &&
    episode.lastSyncedName === name
  ) {
    return { action: 'unchanged', name }
  }
  if (
    openCommand &&
    ['pending', 'claimed', 'running'].includes(openCommand.status) &&
    openCommand.desiredVersion === episode.desiredVersion &&
    openCommand.card === person.card &&
    openCommand.name === name
  ) {
    return { action: 'pending', name }
  }
  return { action: episode.linked ? 'update' : 'retry', name }
}

/** What the screen shows for one person on one machine. */
export type ProvisionStatus =
  | { state: 'notEnrolled' }
  | { state: 'pending' | 'synced' | 'updatePending' | 'failed'; error?: string | null }
  | { state: 'blocked'; reason: ProvisionReason }

export function provisionStatus(plan: ProvisionPlan, episode: ProvisionEpisode | null, lastError: string | null): ProvisionStatus {
  if (plan.action === 'skip') {
    // Not on the device and not provisionable: the reason is the status, except "not eligible" for someone never enrolled.
    if (!episode && (plan.reason === 'errNotEligible' || plan.reason === 'errNoCard')) return { state: 'notEnrolled' }
    return { state: 'blocked', reason: plan.reason }
  }
  if (!episode || plan.action === 'create') return { state: 'notEnrolled' }
  if (episode.syncState === 'failed') return { state: 'failed', error: lastError }
  if (plan.action === 'unchanged') return { state: 'synced' }
  if (episode.linked) return { state: 'updatePending' }
  return { state: 'pending' }
}

// ---------------------------------------------------------------------------
// Store (the caller's own client; the RPC decides who may write).

export interface ProvisionQueued {
  personId: string
  machineId: string
  enrollmentId: string
  desiredVersion: number
  outcome: ProvisionOutcome
}

export interface ProvisionSkipped {
  personId: string
  machineId: string
  reason: ProvisionReason
}

export interface ProvisionResult {
  queued: ProvisionQueued[]
  skipped: ProvisionSkipped[]
}

/** Plans and queues provisioning; existingOnly updates only machines the person is already on (a card change). */
export async function enqueueProvisioning(
  supabase: SupabaseClient,
  kind: ProvisionKind,
  personIds: readonly string[],
  machineIds: readonly string[],
  existingOnly = false,
): Promise<ProvisionResult | { error: 'errSave' }> {
  const { data, error } = await supabase.rpc('enqueue_attendance_provisioning', {
    entity_type: kind,
    person_ids: personIds,
    machine_ids: machineIds,
    existing_only: existingOnly,
  })
  if (error || !data || !Array.isArray(data.queued) || !Array.isArray(data.skipped)) return { error: 'errSave' }
  return { queued: data.queued as ProvisionQueued[], skipped: data.skipped as ProvisionSkipped[] }
}

export interface EpisodeRow {
  id: string
  machine_id: string
  machine_user_id: string
  student_id: string | null
  employee_id: string | null
  desired_state: ProvisionEpisode['desiredState']
  sync_state: ProvisionEpisode['syncState']
  linked_at: string | null
  last_synced_card: string | null
  last_synced_name: string | null
  desired_version: number
  last_error: string | null
  last_command_id: string | null
}

const ID_CHUNK = 150

/** Open episodes of these people (any machine), and the latest command of each, read under RLS. */
export async function openEpisodes(
  supabase: SupabaseClient,
  kind: ProvisionKind,
  personIds: readonly string[],
): Promise<{ episodes: EpisodeRow[]; commands: Map<string, ProvisionCommand> }> {
  const column = kind === 'student' ? 'student_id' : 'employee_id'
  const episodes: EpisodeRow[] = []
  for (let i = 0; i < personIds.length; i += ID_CHUNK) {
    const { data } = await supabase
      .from('attendance_machine_enrollments')
      .select('id, machine_id, machine_user_id, student_id, employee_id, desired_state, sync_state, linked_at, last_synced_card, last_synced_name, desired_version, last_error, last_command_id')
      .in(column, personIds.slice(i, i + ID_CHUNK))
      .is('unlinked_at', null)
    episodes.push(...((data ?? []) as EpisodeRow[]))
  }
  const commandIds = episodes.map((e) => e.last_command_id).filter((id): id is string => !!id)
  const commands = new Map<string, ProvisionCommand>()
  for (let i = 0; i < commandIds.length; i += ID_CHUNK) {
    const { data } = await supabase.from('machine_commands').select('id, status, payload').in('id', commandIds.slice(i, i + ID_CHUNK))
    for (const c of (data ?? []) as { id: string; status: string; payload: Record<string, unknown> }[]) {
      commands.set(c.id, {
        status: c.status,
        desiredVersion: Number(c.payload.desiredVersion),
        card: (c.payload.card as string | null) ?? null,
        name: String(c.payload.name ?? ''),
      })
    }
  }
  return { episodes, commands }
}

/** The pure planner's view of an episode row. */
export function toProvisionEpisode(row: EpisodeRow, personId: string): ProvisionEpisode {
  return {
    samePerson: (row.student_id ?? row.employee_id) === personId,
    desiredState: row.desired_state,
    syncState: row.sync_state,
    linked: row.linked_at !== null,
    lastSyncedCard: row.last_synced_card,
    lastSyncedName: row.last_synced_name,
    desiredVersion: row.desired_version,
  }
}
