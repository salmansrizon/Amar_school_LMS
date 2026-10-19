import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Written for migration 0252 (#696) — NOT RUN (the integration suite writes to
// the shared database). Needs 0252 applied.
//
// Seam: an unpublished notice is hidden from the Student and still visible to
// the School; republishing shows it again; only a notice can be unpublished;
// a Student cannot change the mark.

const P = 'M0252 '

describe('Notice unpublish and republish (migration 0252)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let noticeId: string
  let homeworkId: string

  const studentSees = async (id: string) =>
    ((await student.from('publications').select('id').eq('id', id)).data ?? []).length === 1

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    await owner.from('publications').delete().like('title', `${P}%`)
    const post = async (kind: string) => {
      const { data, error } = await owner
        .from('publications')
        .insert({ kind, importance: 'normal', title: `${P}${kind}`, target_scope: 'all' })
        .select('id, unpublished_at, created_at')
        .single()
      if (error) throw new Error(error.message)
      expect(data.unpublished_at).toBeNull()
      return data.id as string
    }
    noticeId = await post('notice')
    homeworkId = await post('homework')
  })

  afterAll(async () => {
    await owner.from('publications').delete().like('title', `${P}%`)
  })

  it('a new notice is published: the Student reads it', async () => {
    expect(await studentSees(noticeId)).toBe(true)
  })

  it('unpublishing hides it from the Student, not from the School', async () => {
    const before = (await owner.from('publications').select('created_at').eq('id', noticeId).single()).data!.created_at
    const { error } = await owner
      .from('publications')
      .update({ unpublished_at: new Date().toISOString() })
      .eq('id', noticeId)
    expect(error).toBeNull()
    expect(await studentSees(noticeId)).toBe(false)
    const mine = await owner.from('publications').select('id, created_at, unpublished_at').eq('id', noticeId).single()
    expect(mine.data!.unpublished_at).not.toBeNull()
    expect(mine.data!.created_at).toBe(before)
  })

  it('a Student cannot republish it', async () => {
    const { data } = await student.from('publications').update({ unpublished_at: null }).eq('id', noticeId).select('id')
    expect(data ?? []).toEqual([])
    expect(await studentSees(noticeId)).toBe(false)
  })

  it('republishing shows it again', async () => {
    const { error } = await owner.from('publications').update({ unpublished_at: null }).eq('id', noticeId)
    expect(error).toBeNull()
    expect(await studentSees(noticeId)).toBe(true)
  })

  it('only a notice can be unpublished', async () => {
    const { error } = await owner
      .from('publications')
      .update({ unpublished_at: new Date().toISOString() })
      .eq('id', homeworkId)
    expect(error?.message).toMatch(/publications_unpublish_notice_only/)
  })
})
