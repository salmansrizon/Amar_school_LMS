import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'
import { signedIn } from '../../tests/helpers/auth'
import type { SupabaseClient } from '@supabase/supabase-js'

/** School SMS wallet segment balance = sum of its ledger entries (super reads). */
async function smsBalance(sup: SupabaseClient, schoolId: string): Promise<number> {
  const { data: w } = await sup
    .from('wallets')
    .select('id')
    .eq('wallet_type', 'school_sms')
    .eq('owner_school_id', schoolId)
    .maybeSingle()
  if (!w) return 0
  const { data: entries } = await sup.from('wallet_ledger_entries').select('quantity').eq('wallet_id', w.id)
  return (entries ?? []).reduce((s, e) => s + (e.quantity ?? 0), 0)
}

// School SMS (map #329, ticket #335, playwright-crud-plan §3). Compose surface +
// buy page render for the owner; staff blocked from buying (owner-only). The
// actual send + package purchase (wallet mutation, gateway) are side-effectful
// and encoded as gaps.

test.describe('@crud @school sms', () => {
  test('owner opens compose + buy', async ({ ownerPage: page }) => {
    await page.goto('/school/sms')
    await expect(page.locator('main').first()).toBeVisible()
    await expectNoError(page)

    await page.goto('/school/sms/buy')
    await expect(page).toHaveURL(/\/school\/sms\/buy/)
    await expectNoError(page)
  })

  test('staff blocked from buying SMS (owner-only)', async ({ browser }) => {
    const page = await asRole(browser, 'staff')
    await page.goto('/school/sms/buy')
    await expect(page).not.toHaveURL(/\/school\/sms\/buy/)
    await page.context().close()
  })

  test('owner buys a package → wallet segment balance rises', async ({ ownerPage: page }) => {
    const sup = await signedIn('super@test.local')
    const schoolId = (await sup.from('schools').select('id').eq('name', 'Test School A').single()).data!.id
    const before = await smsBalance(sup, schoolId)

    await page.goto('/school/sms/buy')
    const buy = page
      .locator('section', { hasText: 'E2E Starter' })
      .getByRole('button', { name: 'কিনুন' }) // sms.buy (bn)
    await buy.click()
    await expect(buy).toBeEnabled() // pending cleared → purchase completed
    await expect(page.locator('.text-alert-deep')).toHaveCount(0)

    // Seeded package is 500 segments → wallet ledger gains a +500 topup.
    await expect.poll(async () => await smsBalance(sup, schoolId)).toBeGreaterThanOrEqual(before + 500)
    await expectNoError(page)
  })

  // Gap: compose→send (segment debit + gateway dispatch) still needs a send
  // assertion harness (masked/non-masked routing, dedupe) — left as a gap.
  test.fixme('compose sends debits the wallet', async () => {})
})
