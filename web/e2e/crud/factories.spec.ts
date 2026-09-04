import { test, expect } from '../fixtures/roles'
import { cleanupAll, ownerClient, createClass, createStudent } from './factories'

// Proves the deep-CRUD factory foundation (map #329, ticket #358): a class and a
// student can be built + read back + cleaned up via the owner client, isolated
// per run. The module specs (#359–#364) compose these.
test.describe('@crud deep-crud factories', () => {
  // #541: drains whatever the factories built, pass or fail. The per-object
  // cleanup() call at the end of a test body never runs when the test is the
  // thing that failed, which is how 61 orphaned students accumulated.
  test.afterEach(cleanupAll)

  test('createClass + createStudent build, read back, and clean up', async () => {
    const owner = await ownerClient()

    const klass = await createClass(owner)
    const student = await createStudent(owner, { className: klass.name, section: klass.section })

    // Readable back through RLS (owner sees own school's rows).
    expect((await owner.from('class_offerings').select('id').eq('id', klass.id).maybeSingle()).data?.id).toBe(klass.id)
    expect((await owner.from('students').select('id').eq('id', student.id).maybeSingle()).data?.id).toBe(student.id)

    await student.cleanup()
    await klass.cleanup()

    // Gone after cleanup.
    expect((await owner.from('students').select('id').eq('id', student.id).maybeSingle()).data).toBeNull()
    expect((await owner.from('class_offerings').select('id').eq('id', klass.id).maybeSingle()).data).toBeNull()
  })
})
