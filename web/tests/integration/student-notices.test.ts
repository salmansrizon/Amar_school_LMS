import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: the Student's notice targeting (#445, migration 0139).
//
// The whole guarantee is "the right students and no others", so every case here
// is about who a publication reaches. Fixture: the seeded Student of School A in
// "Seed Class - A" (supabase/seed-test.sql).

const P = 'SN1 '

describe('Student notices (#445)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  const ids: Record<string, string> = {}

  async function post(fields: Record<string, unknown>): Promise<string> {
    const { data, error } = await owner
      .from('publications')
      .insert({ kind: 'notice', importance: 'normal', ...fields })
      .select('id')
      .single()
    if (error) throw new Error(`fixture notice: ${error.message}`)
    return data.id
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')

    const { data: me } = await student.from('student_self').select('id').single()
    studentId = me!.id

    await owner.from('publications').delete().like('title', `${P}%`)

    ids.schoolWide = await post({ title: `${P}School wide`, target_type: 'all' })
    ids.myClassAndSection = await post({
      title: `${P}My class and section`,
      target_type: 'specific',
      target_class_name: 'Seed Class',
      target_section: 'A',
    })
    ids.myClassAnySection = await post({
      title: `${P}My class any section`,
      target_type: 'specific',
      target_class_name: 'Seed Class',
      target_section: null,
    })
    ids.otherClass = await post({
      title: `${P}Other class`,
      target_type: 'specific',
      target_class_name: 'Not My Class',
      target_section: 'B',
    })
    ids.otherSection = await post({
      title: `${P}Same class other section`,
      target_type: 'specific',
      target_class_name: 'Seed Class',
      target_section: 'B',
    })
  })

  afterAll(async () => {
    await owner.from('publications').delete().like('title', `${P}%`)
  })

  it('delivers a school-wide notice and both forms of class notice', async () => {
    const { data } = await student.from('publications').select('title').like('title', `${P}%`)
    const titles = (data ?? []).map((r) => r.title).sort()
    expect(titles).toEqual([
      `${P}My class and section`,
      `${P}My class any section`,
      `${P}School wide`,
    ])
  })

  it('a class-only target reaches every section of that class', async () => {
    // "Class Nine", no section, must reach Nine A and Nine B alike — a null
    // part of the target means "any", not "blank".
    const { data } = await student.from('publications').select('id').eq('id', ids.myClassAnySection)
    expect(data).toHaveLength(1)
  })

  it('withholds another class, and another section of my own class', async () => {
    for (const id of [ids.otherClass, ids.otherSection]) {
      const { data } = await student.from('publications').select('id').eq('id', id)
      expect(data ?? []).toEqual([])
    }
  })

  it('records a read receipt, and refuses to record one for anybody else', async () => {
    const mine = await student
      .from('student_publication_reads')
      .insert({ student_id: studentId, publication_id: ids.schoolWide })
    expect(mine.error).toBeNull()

    const { data: seen } = await student
      .from('student_publication_reads')
      .select('publication_id')
    expect(seen?.map((r) => r.publication_id)).toContain(ids.schoolWide)

    const forged = await student.from('student_publication_reads').insert({
      student_id: '00000000-0000-0000-0000-000000000000',
      publication_id: ids.schoolWide,
    })
    expect(forged.error).not.toBeNull()
  })

  it('a receipt cannot be deleted, so "new since last visit" stays honest', async () => {
    const { data } = await student
      .from('student_publication_reads')
      .delete()
      .eq('publication_id', ids.schoolWide)
      .select('publication_id')
    expect(data ?? []).toEqual([])

    const { data: still } = await student
      .from('student_publication_reads')
      .select('publication_id')
      .eq('publication_id', ids.schoolWide)
    expect(still).toHaveLength(1)
  })
})
