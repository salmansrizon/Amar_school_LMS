import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Infra smoke (map #329, ticket #330): proves the per-role storageState fixtures
// work — every role starts authenticated and lands on its own home with no login
// step and no error overlay. If this is green, the CRUD suites can build on it.
test.describe('@crud infra: per-role auth fixtures', () => {
  test('owner lands on /school', async ({ ownerPage }) => {
    await ownerPage.goto('/school')
    await expect(ownerPage).toHaveURL(/\/school(\/|$)/)
    await expectNoError(ownerPage)
  })

  test('super-admin lands on /super-admin', async ({ superAdminPage }) => {
    await superAdminPage.goto('/super-admin')
    await expect(superAdminPage).toHaveURL(/\/super-admin(\/|$)/)
    await expectNoError(superAdminPage)
  })

  test('distributor lands on /distributor', async ({ distributorPage }) => {
    await distributorPage.goto('/distributor')
    await expect(distributorPage).toHaveURL(/\/distributor(\/|$)/)
    await expectNoError(distributorPage)
  })

  test('agent lands on /agent', async ({ agentPage }) => {
    await agentPage.goto('/agent')
    await expect(agentPage).toHaveURL(/\/agent(\/|$)/)
    await expectNoError(agentPage)
  })

  test('gov lands on /gov', async ({ govPage }) => {
    await govPage.goto('/gov')
    await expect(govPage).toHaveURL(/\/gov(\/|$)/)
    await expectNoError(govPage)
  })
})
