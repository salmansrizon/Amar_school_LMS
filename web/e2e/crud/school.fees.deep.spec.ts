import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'
import { cleanupAll, ownerClient, createClass, createStudent } from './factories'

// Deep CRUD for the Fees module (map #329, ticket #364). Fee collection needs a
// class + a student in it: the collection page resolves the roster by
// class_name+section and renders the FeeForm for ?class&student. Record a
// payment (create) → verify the fee_collection_record → edit the amount (update).
// No delete (financial record). Asserted against the DB via the owner client.

const SAVE = 'আদায় করুন ও রসিদ ছাপুন' // fees.collectAndPrint

async function feePayAmount(owner: Awaited<ReturnType<typeof ownerClient>>, studentId: string): Promise<number> {
  const { data } = await owner
    .from('fee_collection_records')
    .select('pay_amount')
    .eq('student_id', studentId)
    .maybeSingle()
  return data ? Number(data.pay_amount) : -1
}

test.describe('@crud @school fees-deep', () => {
  // #541: drains whatever the factories built, pass or fail. The per-object
  // cleanup() call at the end of a test body never runs when the test is the
  // thing that failed, which is how 61 orphaned students accumulated.
  test.afterEach(cleanupAll)

  test('record payment → verify → edit amount', async ({ ownerPage: page }) => {
    const owner = await ownerClient()
    const klass = await createClass(owner)
    const student = await createStudent(owner, { className: klass.name, section: klass.section })
    const now = new Date()
    const url = `/school/fees?class=${klass.id}&student=${student.id}&month=${now.getMonth() + 1}&year=${now.getFullYear()}`

    // Create: record a 500 payment.
    await page.goto(url)
    await page.locator('#received_amount').fill('500')
    await page.getByRole('button', { name: SAVE }).click()
    await expect.poll(() => feePayAmount(owner, student.id)).toBe(500)

    // Update: edit the amount to 700.
    await page.goto(url)
    await page.locator('#received_amount').fill('700')
    await page.getByRole('button', { name: SAVE }).click()
    await expect.poll(() => feePayAmount(owner, student.id)).toBe(700)
    await expectNoError(page)

    // Cleanup: student delete cascades the fee record; then the class.
    await student.cleanup()
    await klass.cleanup()
  })
})
