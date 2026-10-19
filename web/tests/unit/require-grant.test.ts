import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/i18n-server', () => ({ currentLang: async () => 'en' }))

import { requireScreenGrant, screenGrantDenied } from '@/lib/auth/require-grant'
import { t } from '@/lib/i18n'

// #687. app_module_granted (0136) is the database's own answer: true for the
// School Owner, true for a Staff User holding the grant, false otherwise.
function fakeClient(result: { data: unknown; error?: unknown }) {
  const rpc = vi.fn(async () => ({ error: null, ...result }))
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('requireScreenGrant', () => {
  it('passes the Owner and a Staff User holding the grant', async () => {
    const { client, rpc } = fakeClient({ data: true })
    expect(await requireScreenGrant(client, 'fees')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('app_module_granted', { p_module: 'fees' })
  })

  it('refuses a Staff User without the grant', async () => {
    expect(await requireScreenGrant(fakeClient({ data: false }).client, 'fees')).toBe(false)
  })

  it('fails closed when the database gives no answer', async () => {
    expect(await requireScreenGrant(fakeClient({ data: null, error: { message: 'boom' } }).client, 'fees')).toBe(false)
  })
})

describe('screenGrantDenied', () => {
  it('returns null when granted', async () => {
    expect(await screenGrantDenied(fakeClient({ data: true }).client, 'fees')).toBeNull()
  })

  it('returns the localized error result when refused — it does not throw', async () => {
    expect(await screenGrantDenied(fakeClient({ data: false }).client, 'fees')).toEqual({
      error: t('denied.title', 'en'),
    })
  })
})
