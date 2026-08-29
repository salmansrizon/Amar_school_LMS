import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'
import { signedIn } from '../../tests/helpers/auth'
import type { SupabaseClient } from '@supabase/supabase-js'

// School approvals inbox (map #329, ticket #336, playwright-crud-plan §3). The
// owner approves an in-progress workflow instance (it leaves the list); a
// non-approver staff member gets the workflow_decide RPC error. Each test
// self-seeds a fresh instance via workflow_start (owner is a tenant member), so
// reruns are isolated. `attendance_correction` has a single stage with
// approver_role='school_owner' and no post-approval sync trigger.

const APPROVE_BN = 'অনুমোদন' // approvals.approve (bn default)

async function startInstance(owner: SupabaseClient, entityType: string): Promise<string> {
  const schoolId = (await owner.from('profiles').select('school_id').limit(1).single()).data!.school_id
  const { data, error } = await owner.rpc('workflow_start', {
    p_definition_key: 'attendance_correction',
    p_school_id: schoolId,
    p_entity_type: entityType,
    p_entity_id: 'e2e',
  })
  if (error) throw new Error(`workflow_start failed: ${error.message}`)
  return data as string
}

test.describe('@crud @school approvals', () => {
  test('owner opens the approvals inbox', async ({ ownerPage: page }) => {
    await page.goto('/school/approvals')
    await expect(page.locator('main').first()).toBeVisible()
    await expectNoError(page)
  })

  test('owner approves an in-progress instance → it leaves the list', async ({ ownerPage: page }) => {
    const owner = await signedIn('owner-a@test.local')
    const et = `e2e-approve-${Date.now()}`
    await startInstance(owner, et)

    await page.goto('/school/approvals')
    const row = page.locator('li', { hasText: et })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: APPROVE_BN }).click()
    // Single owner stage → approve completes the workflow → row leaves in_progress.
    await expect(page.locator('li', { hasText: et })).toHaveCount(0)
    await expectNoError(page)
  })

  test('staff (non-approver) approving surfaces the RPC error', async ({ browser }) => {
    const owner = await signedIn('owner-a@test.local')
    const et = `e2e-staff-${Date.now()}`
    const id = await startInstance(owner, et)

    const page = await asRole(browser, 'staff')
    await page.goto('/school/approvals')
    const row = page.locator('li', { hasText: et })
    await expect(row).toBeVisible() // staff can view (RLS-scoped), not decide
    await row.getByRole('button', { name: APPROVE_BN }).click()
    await expect(row.locator('.text-alert-deep')).toBeVisible() // "not an approver"
    await page.context().close()

    // Cleanup: owner rejects it so it leaves the in_progress inbox.
    await owner.rpc('workflow_decide', { p_instance_id: id, p_decision: 'rejected' })
  })
})
