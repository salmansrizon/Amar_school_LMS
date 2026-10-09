import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { photoUrls } from '@/lib/photos'
import { anonClient, signedIn } from '../helpers/auth'

// Seam: the private 'employee-photos' bucket and employees.photo_path.
//
// NOT RUN. Written with migration 0262_employee_photo.sql, which is not
// applied (the owner pastes it) — every case below fails until it is. Run after
// applying:  npx vitest run -c vitest.integration.config.ts tests/integration/employee-photo.test.ts
//
// What it pins: folder-per-school RLS on storage.objects (a School member reads
// and writes only under their own School's folder), the image-only allow-list,
// that anon gets nothing, and that the batch signer returns a URL only for rows
// that have a photo.

// A 1x1 PNG — real bytes, so Storage's mime sniffing and size cap apply.
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)
const BUCKET = 'employee-photos'

describe('Employee photo (migration 0262)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let staff: SupabaseClient
  let schoolAId: string
  let schoolBId: string
  let employeeId: string
  let otherEmployeeId: string
  let path: string
  const created: string[] = []

  const schoolOf = async (client: SupabaseClient) => {
    const { data: user } = await client.auth.getUser()
    return (await client.from('profiles').select('school_id').eq('id', user.user!.id).single()).data!.school_id as string
  }

  beforeAll(async () => {
    ;[ownerA, ownerB, staff] = await Promise.all([
      signedIn('owner-a@test.local'),
      signedIn('owner-b@test.local'),
      signedIn('staff-a1@test.local'),
    ])
    ;[schoolAId, schoolBId] = await Promise.all([schoolOf(ownerA), schoolOf(ownerB)])
    const { data, error } = await ownerA
      .from('employees')
      .insert([
        { school_id: schoolAId, full_name: 'Photo Test One' },
        { school_id: schoolAId, full_name: 'Photo Test Two' },
      ])
      .select('id')
    expect(error).toBeNull()
    ;[employeeId, otherEmployeeId] = data!.map((e) => e.id as string)
    created.push(employeeId, otherEmployeeId)
    path = `${schoolAId}/${employeeId}.png`
  }, 30000)

  afterAll(async () => {
    await ownerA.storage.from(BUCKET).remove([path, `${schoolAId}/staff-${employeeId}.png`, `${schoolAId}/${employeeId}.pdf`])
    await ownerA.from('employees').delete().in('id', created)
  }, 30000)

  it('the Owner uploads into their own School folder, records the path, and reads it back', async () => {
    const { error } = await ownerA.storage.from(BUCKET).upload(path, PNG_1PX, { contentType: 'image/png', upsert: true })
    expect(error).toBeNull()
    const { error: rowErr } = await ownerA.from('employees').update({ photo_path: path }).eq('id', employeeId)
    expect(rowErr).toBeNull()
    const { data: signed } = await ownerA.storage.from(BUCKET).createSignedUrl(path, 60)
    expect(signed?.signedUrl).toBeTruthy()
  })

  it('the Owner replaces the photo (same path, upsert)', async () => {
    const { error } = await ownerA.storage.from(BUCKET).upload(path, PNG_1PX, { contentType: 'image/png', upsert: true })
    expect(error).toBeNull()
  })

  it('a Staff User of the same School reads and uploads, as with student photos', async () => {
    const { data: signed } = await staff.storage.from(BUCKET).createSignedUrl(path, 60)
    expect(signed?.signedUrl).toBeTruthy()
    const { error } = await staff.storage
      .from(BUCKET)
      .upload(`${schoolAId}/staff-${employeeId}.png`, PNG_1PX, { contentType: 'image/png', upsert: true })
    expect(error).toBeNull()
  })

  it("another School's Owner can neither read, overwrite nor delete it", async () => {
    const { data: signed, error: readErr } = await ownerB.storage.from(BUCKET).createSignedUrl(path, 60)
    expect(readErr).not.toBeNull()
    expect(signed?.signedUrl).toBeFalsy()

    const { error: writeErr } = await ownerB.storage.from(BUCKET).upload(path, PNG_1PX, { contentType: 'image/png', upsert: true })
    expect(writeErr).not.toBeNull()

    await ownerB.storage.from(BUCKET).remove([path])
    const { data: still } = await ownerA.storage.from(BUCKET).createSignedUrl(path, 60)
    expect(still?.signedUrl).toBeTruthy()
  })

  it("an Owner cannot write into another School's folder", async () => {
    const { error } = await ownerA.storage
      .from(BUCKET)
      .upload(`${schoolBId}/${employeeId}.png`, PNG_1PX, { contentType: 'image/png', upsert: true })
    expect(error).not.toBeNull()
  })

  it('anon can neither read nor write', async () => {
    const anon = anonClient()
    const { data: signed } = await anon.storage.from(BUCKET).createSignedUrl(path, 60)
    expect(signed?.signedUrl).toBeFalsy()
    const { error } = await anon.storage.from(BUCKET).upload(`${schoolAId}/anon.png`, PNG_1PX, { contentType: 'image/png' })
    expect(error).not.toBeNull()
  })

  it('rejects a non-image upload (bucket mime allow-list)', async () => {
    const { error } = await ownerA.storage
      .from(BUCKET)
      .upload(`${schoolAId}/${employeeId}.pdf`, new Uint8Array([1, 2, 3]), { contentType: 'application/pdf', upsert: true })
    expect(error).not.toBeNull()
  })

  it('the batch signer gives a URL only to the employee that has a photo', async () => {
    const urls = await photoUrls(ownerA, 'employee', [employeeId, otherEmployeeId])
    expect(urls.get(employeeId)).toBeTruthy()
    expect(urls.has(otherEmployeeId)).toBe(false)
  })

  it("the batch signer gives another School's Owner nothing", async () => {
    expect((await photoUrls(ownerB, 'employee', [employeeId])).size).toBe(0)
  })

  it('the Owner deletes the photo', async () => {
    await ownerA.from('employees').update({ photo_path: null }).eq('id', employeeId)
    const { error } = await ownerA.storage.from(BUCKET).remove([path])
    expect(error).toBeNull()
    const { data: signed } = await ownerA.storage.from(BUCKET).createSignedUrl(path, 60)
    expect(signed?.signedUrl).toBeFalsy()
  })
})
