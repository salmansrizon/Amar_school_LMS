import { test, expect, asRole } from '../fixtures/roles'
import { expectInlineError, expectNoError, pickOption } from '../helpers'
import { signedIn } from '../../tests/helpers/auth'
import { formatTaka } from '@/lib/money'

// Super-admin Settlements (map #329, ticket #356, playwright-crud-plan §3).
// Read + validation + the full run→approve→pay happy path: seed accrued
// commission via commission_accrue (super-callable, same path as SMS/subscription
// accrual) with a unique amount per run so the settlement row is identifiable,
// then run the settlement and approve & pay it. GL residue on the shared DB is
// accepted (per the grilling decision).

const PATH = '/super-admin/settlements'
const DEALER = '55555555-5555-5555-5555-555555555555'

test.describe('@crud @super-admin settlements', () => {
  test('read: heading + table + distributor options render', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    await expect(page.getByRole('heading', { name: 'Settlements' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Unsettled' })).toBeVisible()
    // The distributor picker's options only exist in the DOM while its popup
    // is open (ComboboxField, ui/combobox-field.tsx).
    await page.getByRole('combobox').first().click()
    await expect(page.getByRole('option').nth(1)).toBeAttached()
    await expectNoError(page)
  })

  test('run with an invalid period → inline error', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    // No id/aria-label (bare grid form) but the only combobox on the page;
    // index 0 is the disabled "Distributor…" placeholder.
    await page.getByRole('combobox').first().click()
    await page.getByRole('option').nth(1).click()
    await page.locator('input[name="period_start"]').fill('2020-12-31')
    await page.locator('input[name="period_end"]').fill('2020-01-01')
    await page.getByRole('button', { name: 'Run settlement' }).click()
    await expectInlineError(page, 'valid period')
    await expectNoError(page)
  })

  test('run bundles accrued → approve & pay → status paid', async ({ superAdminPage: page }) => {
    const sup = await signedIn('super@test.local')
    // Unique base → unique commission (the rule's rate doesn't matter; we read
    // the resulting amount back so the settlement row is identifiable).
    const { data: cid, error } = await sup.rpc('commission_accrue', {
      p_distributor: DEALER,
      p_stream: 'subscription',
      p_source_type: 'e2e-settle',
      p_source_id: `e2e-${Date.now()}`,
      p_base_amount: 1_000_000 + (Date.now() % 9_000_000),
    })
    expect(error).toBeFalsy()
    const { data: c } = await sup.from('commissions').select('commission_amount').eq('id', cid as string).single()
    const amtStr = formatTaka(c!.commission_amount) // the settlement total to find

    // The picker is type-to-filter now (ComboboxField) and matches by visible
    // label, not the raw id — look the distributor's display name up so the
    // UI interaction stays a real "type/select by name" rather than an id.
    const { data: dealer } = await sup.from('distributors').select('name').eq('id', DEALER).single()

    await page.goto(PATH)
    await pickOption(page, page.getByRole('combobox').first(), dealer!.name)
    const today = new Date().toISOString().slice(0, 10)
    await page.locator('input[name="period_start"]').fill(today)
    await page.locator('input[name="period_end"]').fill(today)
    await page.getByRole('button', { name: 'Run settlement' }).click()

    // The draft settlement carries our unique total; approve & pay it → paid.
    const row = page.locator('tr', { hasText: amtStr })
    await expect(row).toContainText('draft')
    await row.getByRole('button', { name: 'Approve & pay' }).click()
    await expect(page.locator('tr', { hasText: amtStr })).toContainText('paid')
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach settlements', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/settlements/)
    await page.context().close()
  })
})
