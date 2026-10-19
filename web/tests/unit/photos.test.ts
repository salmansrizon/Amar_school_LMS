import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PHOTO_KINDS, isPhotoKind, photoBroken, photoObjectPath, photoUrls, rowsWithPhoto, urlsById } from '@/lib/photos'

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const PERSON = '22222222-2222-4222-8222-222222222222'

describe('photoObjectPath', () => {
  it('builds {school}/{person}.{ext} from the MIME type', () => {
    expect(photoObjectPath(SCHOOL, PERSON, 'image/jpeg')).toBe(`${SCHOOL}/${PERSON}.jpg`)
    expect(photoObjectPath(SCHOOL, PERSON, 'image/webp')).toBe(`${SCHOOL}/${PERSON}.webp`)
  })

  it('refuses anything that is not an allowed image', () => {
    for (const mime of ['application/pdf', 'image/svg+xml', 'image/gif', 'text/html', ''])
      expect(photoObjectPath(SCHOOL, PERSON, mime)).toBeNull()
  })

  it('refuses an id that could leave the School folder', () => {
    expect(photoObjectPath(SCHOOL, `../${SCHOOL}/x`, 'image/png')).toBeNull()
    expect(photoObjectPath(SCHOOL, 'a/b', 'image/png')).toBeNull()
    expect(photoObjectPath('..', PERSON, 'image/png')).toBeNull()
    expect(photoObjectPath(SCHOOL, '', 'image/png')).toBeNull()
  })
})

describe('isPhotoKind', () => {
  it('accepts only the declared kinds, not inherited keys', () => {
    expect(isPhotoKind('student')).toBe(true)
    expect(isPhotoKind('employee')).toBe(true)
    for (const bad of ['profiles', 'constructor', '__proto__', '', null, undefined, 1]) expect(isPhotoKind(bad)).toBe(false)
  })

  it('keeps one bucket per kind', () => {
    expect(PHOTO_KINDS.student.bucket).toBe('student-photos')
    expect(PHOTO_KINDS.employee.bucket).toBe('employee-photos')
  })
})

describe('which rows get a URL', () => {
  it('only rows that have a photo', () => {
    expect(
      rowsWithPhoto([
        { id: 'a', photo_path: 's/a.webp' },
        { id: 'b', photo_path: null },
        { id: 'c', photo_path: '' },
        { id: 'd' },
      ]),
    ).toEqual([{ id: 'a', path: 's/a.webp' }])
  })

  it('a path Storage did not sign gets no URL', () => {
    const wanted = [
      { id: 'a', path: 's/a.webp' },
      { id: 'b', path: 's/b.webp' },
      { id: 'c', path: 's/c.webp' },
    ]
    const urls = urlsById(wanted, [
      { path: 's/a.webp', signedUrl: 'https://x/a', error: null },
      { path: 's/b.webp', signedUrl: null, error: 'Either the object does not exist or you do not have access to it' },
    ])
    expect([...urls]).toEqual([['a', 'https://x/a']])
  })
})

describe('fallback rule', () => {
  it('finished with no pixels is broken; still loading or loaded is not', () => {
    expect(photoBroken({ complete: true, naturalWidth: 0 })).toBe(true)
    expect(photoBroken({ complete: false, naturalWidth: 0 })).toBe(false)
    expect(photoBroken({ complete: true, naturalWidth: 120 })).toBe(false)
  })
})

/** A fake client that counts round trips. */
function fakeClient(rows: { id: string; photo_path: string | null }[] | null, error: { code: string } | null = null) {
  const calls = { read: 0, sign: 0, signedPaths: [] as string[], bucket: '', table: '' }
  const query = { select: () => query, in: () => query, not: () => Promise.resolve({ data: rows, error }) }
  const client = {
    from: (table: string) => {
      calls.read++
      calls.table = table
      return query
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: vi.fn(async (paths: string[]) => {
          calls.sign++
          calls.bucket = bucket
          calls.signedPaths = paths
          return { data: paths.map((path) => ({ path, signedUrl: `https://x/${path}`, error: null })), error: null }
        }),
      }),
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('photoUrls (cost per list page)', () => {
  it('one read and one sign call for a whole page', async () => {
    const { client, calls } = fakeClient([
      { id: 'a', photo_path: 's/a.webp' },
      { id: 'b', photo_path: 's/b.jpg' },
    ])
    const urls = await photoUrls(client, 'student', ['a', 'b', 'c', 'a'])
    expect(calls).toMatchObject({ read: 1, sign: 1, bucket: 'student-photos', table: 'students' })
    expect(calls.signedPaths).toEqual(['s/a.webp', 's/b.jpg'])
    expect(urls.get('a')).toBe('https://x/s/a.webp')
    expect(urls.has('c')).toBe(false)
  })

  it('no Storage call when nobody on the page has a photo', async () => {
    const { client, calls } = fakeClient([])
    expect((await photoUrls(client, 'student', ['a', 'b'])).size).toBe(0)
    expect(calls).toMatchObject({ read: 1, sign: 0 })
  })

  it('no call at all for an empty page', async () => {
    const { client, calls } = fakeClient([])
    expect((await photoUrls(client, 'employee', [])).size).toBe(0)
    expect(calls).toMatchObject({ read: 0, sign: 0 })
  })

  it('before migration 0262 (column missing) the list just gets letter tiles', async () => {
    const { client, calls } = fakeClient(null, { code: '42703' })
    expect((await photoUrls(client, 'employee', ['a'])).size).toBe(0)
    expect(calls).toMatchObject({ read: 1, sign: 0, table: 'employees' })
  })
})
