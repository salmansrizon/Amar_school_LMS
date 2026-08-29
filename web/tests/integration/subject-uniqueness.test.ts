import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: migration 0165 / ticket #535. The student question form offered
// `XS1 Physics` 25 times — 25 real rows, not an unscoped join — and each carried a
// different subject_id, so the question routed to whichever the child picked.
const TAG = 'ZZ535'

describe('A subject is unique within its class (#535)', () => {
  let owner: SupabaseClient
  let schoolId: string

  async function cleanup() {
    await owner.from('subjects').delete().like('name', `${TAG}%`)
    await owner.from('classes').delete().like('name', `${TAG}%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    const { data: { user } } = await owner.auth.getUser()
    schoolId = (await owner.from('profiles').select('school_id').eq('id', user!.id).single()).data!.school_id
    await cleanup()
  })

  afterAll(cleanup)

  const subject = (name: string, classId: string | null = null) => ({
    school_id: schoolId,
    class_id: classId,
    name,
    theory_marks: 100,
    mcq_marks: 0,
    practical_marks: 0,
    paper_count: 1,
  })

  it('refuses a second school-wide subject of the same name', async () => {
    const first = await owner.from('subjects').insert(subject(`${TAG} Physics`))
    expect(first.error).toBeNull()

    const second = await owner.from('subjects').insert(subject(`${TAG} Physics`))
    expect(second.error).not.toBeNull()
  })

  // NULLS NOT DISTINCT is the whole point: with the default NULLS DISTINCT, two
  // rows with class_id null never collide, which is exactly the shape the 25
  // duplicates had.
  it('treats two null class_ids as the same scope, not as two scopes', async () => {
    const { data } = await owner.from('subjects').select('id').eq('name', `${TAG} Physics`)
    expect(data).toHaveLength(1)
  })

  it('is case-insensitive, so Physics and physics are one subject', async () => {
    const { error } = await owner.from('subjects').insert(subject(`${TAG} physics`))
    expect(error).not.toBeNull()
  })

  it('still allows the same name scoped to a different class', async () => {
    const { data: klass } = await owner
      .from('classes')
      .insert({ name: `${TAG} Class`, section: 'A' })
      .select('id')
      .single()

    const { error } = await owner.from('subjects').insert(subject(`${TAG} Physics`, klass!.id))
    expect(error).toBeNull()
  })
})
