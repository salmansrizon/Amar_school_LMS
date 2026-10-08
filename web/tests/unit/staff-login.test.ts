import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  archivedEmployeeLoginActive,
  changeStaffLogin,
  disabledStaffLogins,
  isMissingFunctionError,
  staffLoginChangeFrom,
  staffLoginState,
} from '@/lib/staff-login'

// #688. Migration 0241 is optional to the app: a missing function or column
// must read as "unavailable", never as an error and never as "enabled".
describe('staff login on/off (#688)', () => {
  it('recognises a missing function, and nothing else', () => {
    expect(isMissingFunctionError({ code: 'PGRST202' })).toBe(true)
    expect(isMissingFunctionError({ code: '42883' })).toBe(true)
    expect(isMissingFunctionError({ code: 'P0001' })).toBe(false)
    expect(isMissingFunctionError(null)).toBe(false)
  })

  it('maps an RPC result to ok / unavailable / failed', () => {
    expect(staffLoginChangeFrom(null)).toBe('ok')
    expect(staffLoginChangeFrom({ code: 'PGRST202' })).toBe('unavailable')
    expect(staffLoginChangeFrom({ code: 'P0001' })).toBe('failed') // refused: not the Owner
  })

  it('calls the function with the target and the wanted state', async () => {
    const rpc = vi.fn(async () => ({ error: null }))
    expect(await changeStaffLogin({ rpc } as unknown as SupabaseClient, 'staff-1', true)).toBe('ok')
    expect(rpc).toHaveBeenCalledWith('set_staff_login_disabled', { p_staff: 'staff-1', p_disabled: true })
  })

  const profiles = (result: { data: unknown; error: unknown }) => {
    const query = { select: () => query, eq: () => query, not: async () => result }
    return { from: () => query } as unknown as SupabaseClient
  }

  it('reads the disabled set; a missing column or any error is null (unavailable)', async () => {
    expect(await disabledStaffLogins(profiles({ data: [{ id: 'a' }], error: null }))).toEqual(new Set(['a']))
    expect(await disabledStaffLogins(profiles({ data: null, error: { code: '42703', message: '' } }))).toBeNull()
    expect(await disabledStaffLogins(profiles({ data: null, error: { code: 'PGRST204', message: '' } }))).toBeNull()
    expect(await disabledStaffLogins(profiles({ data: null, error: { code: 'XX000', message: 'boom' } }))).toBeNull()
  })

  it('one login is enabled, disabled, or unavailable', () => {
    expect(staffLoginState(null, 'a')).toBe('unavailable')
    expect(staffLoginState(new Set(['a']), 'a')).toBe('disabled')
    expect(staffLoginState(new Set(['a']), 'b')).toBe('enabled')
  })

  it('an archived employee whose login still works needs attention', () => {
    expect(archivedEmployeeLoginActive('enabled', true)).toBe(true)
    expect(archivedEmployeeLoginActive('unavailable', true)).toBe(true)
    expect(archivedEmployeeLoginActive('disabled', true)).toBe(false)
    expect(archivedEmployeeLoginActive('enabled', false)).toBe(false)
  })
})
