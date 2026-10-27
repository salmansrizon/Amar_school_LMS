import { describe, it, expect } from 'vitest'
import {
  planProvisioning,
  provisionCardKey,
  provisionDeviceName,
  provisionStatus,
  type ProvisionCapabilities,
  type ProvisionCommand,
  type ProvisionEpisode,
  type ProvisionMachine,
  type ProvisionPerson,
} from '@/lib/attendance-provisioning'

// The pure provisioning planner (Phase 9): the same rules as 0269's
// enqueue_attendance_provisioning, one (person, machine) pair at a time.

/** The verified TIMY TM52GPRS capability set (Phase 5/6). */
const TM52: ProvisionCapabilities = {
  canWriteUsers: true, canWriteRfid: true, canDeleteUsers: false, canCreateUsersWithoutCard: false, canClearCardKeepingUser: false,
  maxMachineUserIdDigits: 8, maxNameLength: 18, supportsUnicodeNames: false, maxCardValue: 4294967295, cardPreservesLeadingZeros: false,
}
const machine = (over: Partial<ProvisionMachine> = {}): ProvisionMachine => ({ inService: true, hasActiveAgent: true, capabilities: TM52, ...over })
const student = (over: Partial<ProvisionPerson> = {}): ProvisionPerson => ({
  kind: 'student', archived: false, uniqueId: 1042, fullName: 'Rahim Uddin', hasEnrollRow: true, card: '0004972001', ...over,
})
const episode = (over: Partial<ProvisionEpisode> = {}): ProvisionEpisode => ({
  samePerson: true, desiredState: 'present', syncState: 'synced', linked: true, lastSyncedCard: '4972001', lastSyncedName: 'Rahim Uddin', desiredVersion: 2, ...over,
})
const command = (over: Partial<ProvisionCommand> = {}): ProvisionCommand => ({ status: 'pending', desiredVersion: 2, card: '0004972001', name: 'Rahim Uddin', ...over })

describe('planProvisioning', () => {
  it('first enrollment creates a pending episode', () => {
    expect(planProvisioning(student(), machine(), null, null)).toEqual({ action: 'create', name: 'Rahim Uddin' })
  })

  it('already synced with the same card (numerically, on TM52GPRS) and name is unchanged', () => {
    expect(planProvisioning(student(), machine(), episode(), null).action).toBe('unchanged')
  })

  it('a card change on a linked episode is an update of the same episode', () => {
    expect(planProvisioning(student({ card: '0013646760' }), machine(), episode(), null).action).toBe('update')
  })

  it('a name change is an update', () => {
    expect(planProvisioning(student({ fullName: 'Rahim U' }), machine(), episode(), null)).toEqual({ action: 'update', name: 'Rahim U' })
  })

  it('a failed sync is retried (update when linked, retry when never linked)', () => {
    expect(planProvisioning(student({ card: '0013646760' }), machine(), episode({ syncState: 'failed' }), null).action).toBe('update')
    expect(planProvisioning(student(), machine(), episode({ syncState: 'failed', linked: false, lastSyncedCard: null }), null).action).toBe('retry')
  })

  it('an open command for the current desired state is not repeated', () => {
    const ep = episode({ syncState: 'pending', linked: false, lastSyncedCard: null, lastSyncedName: null })
    expect(planProvisioning(student(), machine(), ep, command()).action).toBe('pending')
    expect(planProvisioning(student(), machine(), ep, command({ status: 'claimed' })).action).toBe('pending')
    // An older version, another card or a finished command means new desired work.
    expect(planProvisioning(student(), machine(), ep, command({ desiredVersion: 1 })).action).toBe('retry')
    expect(planProvisioning(student(), machine(), ep, command({ card: '0013646760' })).action).toBe('retry')
    expect(planProvisioning(student(), machine(), ep, command({ status: 'failed' })).action).toBe('retry')
  })

  it('archived student, missing enrollment row and missing card are not provisioned', () => {
    expect(planProvisioning(student({ archived: true }), machine(), null, null)).toEqual({ action: 'skip', reason: 'errNotEligible' })
    expect(planProvisioning(student({ hasEnrollRow: false, card: null }), machine(), null, null)).toEqual({ action: 'skip', reason: 'errNotEligible' })
    expect(planProvisioning(student({ card: null }), machine(), null, null)).toEqual({ action: 'skip', reason: 'errNoCard' })
  })

  it('invalid cards: letters, above the device maximum, or a device that cannot write cards', () => {
    expect(planProvisioning(student({ card: 'ABC123' }), machine(), null, null)).toEqual({ action: 'skip', reason: 'errInvalidCard' })
    expect(planProvisioning(student({ card: '4294967296' }), machine(), null, null)).toEqual({ action: 'skip', reason: 'errInvalidCard' })
    expect(planProvisioning(student({ card: '4294967295' }), machine(), null, null).action).toBe('create')
    expect(planProvisioning(student(), machine({ capabilities: { ...TM52, canWriteRfid: false } }), null, null)).toEqual({ action: 'skip', reason: 'errInvalidCard' })
  })

  it('a machine user ID wider than the device allows is refused', () => {
    expect(planProvisioning(student({ uniqueId: 123456789 }), machine(), null, null)).toEqual({ action: 'skip', reason: 'errMachineIdTooWide' })
    expect(planProvisioning(student({ uniqueId: 12345678 }), machine(), null, null).action).toBe('create')
  })

  it('disabled / archived machine, no active Agent, never probed, cannot write users', () => {
    expect(planProvisioning(student(), machine({ inService: false }), null, null)).toEqual({ action: 'skip', reason: 'errMachineNotInService' })
    expect(planProvisioning(student(), machine({ hasActiveAgent: false }), null, null)).toEqual({ action: 'skip', reason: 'errNoAgent' })
    expect(planProvisioning(student(), machine({ capabilities: null }), null, null)).toEqual({ action: 'skip', reason: 'errCapabilitiesUnknown' })
    expect(planProvisioning(student(), machine({ capabilities: {} }), null, null)).toEqual({ action: 'skip', reason: 'errCapabilitiesUnknown' })
    expect(planProvisioning(student(), machine({ capabilities: { ...TM52, canWriteUsers: false } }), null, null)).toEqual({ action: 'skip', reason: 'errUnsupported' })
  })

  it('TM52GPRS: a card-less person is never queued, not even an employee', () => {
    expect(planProvisioning(student({ kind: 'employee', card: null }), machine(), null, null)).toEqual({ action: 'skip', reason: 'errNoCard' })
    // Where the device can create card-less users an employee may go without a card; a student never (OD-6 open).
    const cardless = machine({ capabilities: { ...TM52, canCreateUsersWithoutCard: true } })
    expect(planProvisioning(student({ kind: 'employee', card: null }), cardless, null, null).action).toBe('create')
    expect(planProvisioning(student({ card: null }), cardless, null, null)).toEqual({ action: 'skip', reason: 'errNoCard' })
  })

  it('TM52GPRS: clearing the card of someone on the device is not queued as Card = null', () => {
    expect(planProvisioning(student({ kind: 'employee', card: null }), machine(), episode(), null)).toEqual({ action: 'skip', reason: 'errCardClearUnsupported' })
  })

  it('TM52GPRS: removal is manual; a device that can delete still waits for the OD-6 decision', () => {
    const cleared = student({ hasEnrollRow: false, card: null })
    expect(planProvisioning(cleared, machine(), episode(), null)).toEqual({ action: 'skip', reason: 'errManualRemovalRequired' })
    expect(planProvisioning(cleared, machine({ capabilities: { ...TM52, canDeleteUsers: true } }), episode(), null)).toEqual({ action: 'skip', reason: 'errRemovalUndecided' })
  })

  it('a device user ID held by someone else, or a removal in progress, blocks provisioning', () => {
    expect(planProvisioning(student(), machine(), episode({ samePerson: false }), null)).toEqual({ action: 'skip', reason: 'errMachineIdConflict' })
    expect(planProvisioning(student(), machine(), episode({ desiredState: 'absent' }), null)).toEqual({ action: 'skip', reason: 'errRemovalPending' })
  })
})

describe('device name and card key', () => {
  it('fits the name to the device: ASCII only, collapsed, cut to the length, falls back to the machine user ID', () => {
    expect(provisionDeviceName('Rahim Uddin Chowdhury Ahmed', TM52, '1042')).toBe('Rahim Uddin Chowdh')
    expect(provisionDeviceName('  Rahim   Uddin ', TM52, '1042')).toBe('Rahim Uddin')
    expect(provisionDeviceName('রহিম উদ্দিন', TM52, '1042')).toBe('1042')
    expect(provisionDeviceName('রহিম Rahim', TM52, '1042')).toBe('Rahim')
    expect(provisionDeviceName('রহিম উদ্দিন', { ...TM52, supportsUnicodeNames: true }, '1042')).toBe('রহিম উদ্দিন')
  })

  it('compares cards the way the device reads them back', () => {
    expect(provisionCardKey('0004972001', false)).toBe('4972001')
    expect(provisionCardKey('0000', false)).toBe('0')
    expect(provisionCardKey('0004972001', true)).toBe('0004972001')
    expect(provisionCardKey(null, false)).toBeNull()
  })
})

describe('provisionStatus', () => {
  it('maps plan + episode to what the screen shows', () => {
    expect(provisionStatus({ action: 'create', name: 'x' }, null, null)).toEqual({ state: 'notEnrolled' })
    expect(provisionStatus({ action: 'skip', reason: 'errNoCard' }, null, null)).toEqual({ state: 'notEnrolled' })
    expect(provisionStatus({ action: 'skip', reason: 'errCapabilitiesUnknown' }, null, null)).toEqual({ state: 'blocked', reason: 'errCapabilitiesUnknown' })
    expect(provisionStatus({ action: 'unchanged', name: 'x' }, episode(), null)).toEqual({ state: 'synced' })
    expect(provisionStatus({ action: 'pending', name: 'x' }, episode({ linked: false, syncState: 'pending' }), null)).toEqual({ state: 'pending' })
    expect(provisionStatus({ action: 'update', name: 'x' }, episode({ syncState: 'pending' }), null)).toEqual({ state: 'updatePending' })
    expect(provisionStatus({ action: 'update', name: 'x' }, episode({ syncState: 'failed' }), 'vendorError: boom')).toEqual({ state: 'failed', error: 'vendorError: boom' })
    expect(provisionStatus({ action: 'skip', reason: 'errManualRemovalRequired' }, episode(), null)).toEqual({ state: 'blocked', reason: 'errManualRemovalRequired' })
  })
})
