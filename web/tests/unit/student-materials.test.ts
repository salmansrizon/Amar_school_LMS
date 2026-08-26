import { describe, it, expect } from 'vitest'
import { fileKind, isDownloadable, groupMaterials, type StudentMaterial } from '@/lib/student/materials'

const m = (over: Partial<StudentMaterial> & { id: string; kind: string }): StudentMaterial => ({
  source: 'publication',
  title: over.id,
  content: null,
  storage_path: null,
  file_name: null,
  link_url: null,
  posted_at: '2026-08-01T00:00:00Z',
  posted_by: null,
  ...over,
})

describe('fileKind', () => {
  it('reads the type off the file name', () => {
    expect(fileKind(m({ id: 'a', kind: 'syllabus', file_name: 'class-9.pdf' }))).toBe('PDF')
  })

  it('falls back to the storage path when there is no file name', () => {
    expect(fileKind(m({ id: 'a', kind: 'lesson_plan', storage_path: 'sch/1/notes.docx' }))).toBe('DOCX')
  })

  it('returns null rather than guessing when there is no extension', () => {
    expect(fileKind(m({ id: 'a', kind: 'lesson_plan', file_name: 'handout' }))).toBeNull()
    expect(fileKind(m({ id: 'a', kind: 'lesson_plan' }))).toBeNull()
  })
})

describe('isDownloadable', () => {
  it('is true only for a stored object', () => {
    expect(isDownloadable(m({ id: 'a', kind: 'syllabus', storage_path: 'x/y.pdf' }))).toBe(true)
    // A lesson plan can be plain text or a link, with nothing to sign.
    expect(isDownloadable(m({ id: 'b', kind: 'lesson_plan', link_url: 'https://x' }))).toBe(false)
  })
})

describe('groupMaterials', () => {
  it('puts the syllabus first — it is what students go looking for by name', () => {
    const groups = groupMaterials([
      m({ id: 'prep', kind: 'exam_prep' }),
      m({ id: 'plan', kind: 'lesson_plan' }),
      m({ id: 'syl', kind: 'syllabus' }),
    ])
    expect(groups.map((g) => g.key)).toEqual(['syllabus', 'lesson_plan', 'exam_prep'])
  })

  it('orders each group newest first', () => {
    const groups = groupMaterials([
      m({ id: 'old', kind: 'lesson_plan', posted_at: '2026-01-01T00:00:00Z' }),
      m({ id: 'new', kind: 'lesson_plan', posted_at: '2026-09-01T00:00:00Z' }),
    ])
    expect(groups[0].items.map((i) => i.id)).toEqual(['new', 'old'])
  })

  it('keeps an unexpected kind rather than dropping it', () => {
    const groups = groupMaterials([m({ id: 'x', kind: 'something_new' })])
    expect(groups.map((g) => g.key)).toEqual(['something_new'])
  })
})
