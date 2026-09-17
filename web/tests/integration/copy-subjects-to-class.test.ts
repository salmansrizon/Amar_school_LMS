import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// copy_subjects_to_class (issue #642) -- Subject List's "Copy to Class" bulk
// action. Duplicates Subjects onto another Class Offering: source rows are
// never touched, a name already present on the target (case-insensitive,
// subjects_unique_per_class) is skipped rather than overwritten, and the
// target must be this School's own, non-archived Class Offering. Same
// {copied, skipped} shape as copy_class_offerings_to_active_year (#609),
// deliberately with no School-Owner gate -- same authority as adding a
// Subject by hand.
const TAG = 'ZZ642'

interface CopyRow {
  copied: number
  skipped: number
}

describe('copy_subjects_to_class (#642)', () => {
  let owner: SupabaseClient
  let schoolId: string
  let sourceClassId: string
  let targetClassId: string

  async function cleanup() {
    await owner.from('subjects').delete().like('name', `${TAG}%`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  }

  const subjectsOn = async (classId: string) => {
    const { data } = await owner
      .from('subjects')
      .select('name, code, theory_marks, mcq_marks, practical_marks, paper_count')
      .eq('class_id', classId)
      .order('name')
    return data ?? []
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    const {
      data: { user },
    } = await owner.auth.getUser()
    schoolId = (await owner.from('profiles').select('school_id').eq('id', user!.id).single()).data!.school_id
    await cleanup()

    const { data: classes, error } = await owner
      .from('class_offerings')
      .insert([
        { name: `${TAG} Source`, section: 'A' },
        { name: `${TAG} Target`, section: 'A' },
      ])
      .select('id, name')
    if (error) throw new Error(error.message)
    sourceClassId = classes!.find((c) => c.name === `${TAG} Source`)!.id
    targetClassId = classes!.find((c) => c.name === `${TAG} Target`)!.id

    const { error: subErr } = await owner.from('subjects').insert([
      {
        school_id: schoolId,
        class_id: sourceClassId,
        name: `${TAG} English`,
        code: '101',
        theory_marks: 70,
        mcq_marks: 30,
        practical_marks: 0,
        paper_count: 1,
      },
      {
        school_id: schoolId,
        class_id: sourceClassId,
        name: `${TAG} Bangla`,
        code: '102',
        theory_marks: 100,
        mcq_marks: 0,
        practical_marks: 0,
        paper_count: 2,
      },
    ])
    if (subErr) throw new Error(subErr.message)
  })

  afterAll(cleanup)

  it('copies every Subject verbatim, reporting copied = 2, skipped = 0', async () => {
    const sourceIds = (await subjectsOn(sourceClassId)).length
    expect(sourceIds).toBe(2)

    const { data: sourceRows } = await owner.from('subjects').select('id').eq('class_id', sourceClassId)
    const { data, error } = await owner.rpc('copy_subjects_to_class', {
      p_subject_ids: sourceRows!.map((r) => r.id),
      p_target_class_id: targetClassId,
    })
    expect(error).toBeNull()
    expect((data as CopyRow[])[0]).toEqual({ copied: 2, skipped: 0 })

    const target = await subjectsOn(targetClassId)
    expect(target.map((s) => s.name)).toEqual([`${TAG} Bangla`, `${TAG} English`])
    const english = target.find((s) => s.name === `${TAG} English`)!
    expect(english).toMatchObject({ code: '101', theory_marks: 70, mcq_marks: 30, practical_marks: 0, paper_count: 1 })

    // Source rows are byte-unchanged.
    expect(await subjectsOn(sourceClassId)).toHaveLength(2)
  })

  it('a second run is a no-op: copied = 0, both skipped as already present', async () => {
    const { data: sourceRows } = await owner.from('subjects').select('id').eq('class_id', sourceClassId)
    const { data, error } = await owner.rpc('copy_subjects_to_class', {
      p_subject_ids: sourceRows!.map((r) => r.id),
      p_target_class_id: targetClassId,
    })
    expect(error).toBeNull()
    expect((data as CopyRow[])[0]).toEqual({ copied: 0, skipped: 2 })
    expect(await subjectsOn(targetClassId)).toHaveLength(2)
  })

  it('skips a name already on the target without touching its existing config', async () => {
    // Target's copy of English now has 70/30; mutate the SOURCE row's marks
    // so a naive "insert or update" would visibly change the target if this
    // skipped incorrectly.
    await owner.from('subjects').update({ theory_marks: 999 }).eq('class_id', sourceClassId).eq('name', `${TAG} English`)

    const { data: sourceRows } = await owner.from('subjects').select('id').eq('class_id', sourceClassId)
    const { data, error } = await owner.rpc('copy_subjects_to_class', {
      p_subject_ids: sourceRows!.map((r) => r.id),
      p_target_class_id: targetClassId,
    })
    expect(error).toBeNull()
    expect((data as CopyRow[])[0]).toEqual({ copied: 0, skipped: 2 })

    const target = await subjectsOn(targetClassId)
    const english = target.find((s) => s.name === `${TAG} English`)!
    expect(english.theory_marks).toBe(70) // untouched, not 999
  })

  it('rejects an archived target Class Offering', async () => {
    const { data: archived } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Archived`, section: 'A', archived_at: new Date().toISOString() })
      .select('id')
      .single()

    const { data: sourceRows } = await owner.from('subjects').select('id').eq('class_id', sourceClassId)
    const { error } = await owner.rpc('copy_subjects_to_class', {
      p_subject_ids: sourceRows!.map((r) => r.id),
      p_target_class_id: archived!.id,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/not accessible or archived/)
  })

  it('rejects an empty subject selection', async () => {
    const { error } = await owner.rpc('copy_subjects_to_class', {
      p_subject_ids: [],
      p_target_class_id: targetClassId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no subjects selected/)
  })
})
