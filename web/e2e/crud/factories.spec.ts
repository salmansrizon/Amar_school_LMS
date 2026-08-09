import { test, expect } from '../fixtures/roles'
import { ownerClient, createClass, createStudent } from './factories'

// Proves the deep-CRUD factory foundation (map #329, ticket #358): a class and a
// student can be built + read back + cleaned up via the owner client, isolated
// per run. The module specs (#359–#364) compose these.
test.describe('@crud deep-crud factories', () => {
  test('createClass + createStudent build, read back, and clean up', async () => {
    const owner = await ownerClient()

    const klass = await createClass(owner)
    const student = await createStudent(owner, { className: klass.name, section: klass.section })

    // Readable back through RLS (owner sees own school's rows).
    expect((await owner.from('classes').select('id').eq('id', klass.id).maybeSingle()).data?.id).toBe(klass.id)
    expect((await owner.from('students').select('id').eq('id', student.id).maybeSingle()).data?.id).toBe(student.id)

    await student.cleanup()
    await klass.cleanup()

    // Gone after cleanup.
    expect((await owner.from('students').select('id').eq('id', student.id).maybeSingle()).data).toBeNull()
    expect((await owner.from('classes').select('id').eq('id', klass.id).maybeSingle()).data).toBeNull()
  })
})
