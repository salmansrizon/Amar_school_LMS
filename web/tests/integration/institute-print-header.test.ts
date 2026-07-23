import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildInstituteHeader, type SchoolHeaderRow } from '@/lib/institute-print'

// Seam: print chrome foundation (issue #92, map #91) — the header columns on
// `schools` (owner-only, per-School) and the private 'school-logos' bucket
// whose folder-per-school RLS keeps one School's logo out of another's
// printables.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

function anonClient() {
  return createClient(URL, ANON, { auth: { persistSession: false } })
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

// A 1x1 PNG — real bytes, so Storage's mime sniffing and size cap apply.
const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

const HEADER_RESET = { address_line: null, mobile: null, email: null, logo_path: null }

describe('Print chrome foundation (issue #92)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let staff: SupabaseClient
  let schoolAId: string

  beforeAll(async () => {
    ;[ownerA, ownerB, staff] = await Promise.all([
      signedIn('owner-a@test.local'),
      signedIn('owner-b@test.local'),
      signedIn('staff-a1@test.local'),
    ])

    const { data: userA } = await ownerA.auth.getUser()
    schoolAId = (
      await ownerA.from('profiles').select('school_id').eq('id', userA.user!.id).single()
    ).data!.school_id

    await ownerA.from('schools').update(HEADER_RESET).eq('id', schoolAId)
  }, 30000)

  afterAll(async () => {
    await ownerA.from('schools').update(HEADER_RESET).eq('id', schoolAId)
    await ownerA.storage.from('school-logos').remove([`${schoolAId}/logo.png`, `${schoolAId}/logo.pdf`])
  }, 30000)

  describe('header columns', () => {
    it('the Owner stores address, mobile and email, and the builder prints them', async () => {
      const { error } = await ownerA
        .from('schools')
        .update({
          address_line: 'ঝিকরগাছা, যশোর',
          mobile: '01711-000000',
          email: 'info@test-a.edu.bd',
          eiin_no: '123456',
        })
        .eq('id', schoolAId)
      expect(error).toBeNull()

      const { data } = await ownerA
        .from('schools')
        .select(
          'name, address_line, mobile, email, eiin_no, institute_code, mpo_code, center_code, logo_path',
        )
        .eq('id', schoolAId)
        .single()

      const header = buildInstituteHeader(data as SchoolHeaderRow)
      expect(header.addressLine).toBe('ঝিকরগাছা, যশোর')
      expect(header.contactLine).toBe('01711-000000 · info@test-a.edu.bd')
      expect(header.codesLine).toContain('EIIN: 123456')
    })

    it('a Staff User cannot change the printed header (owner-only policy)', async () => {
      const { data } = await staff
        .from('schools')
        .update({ address_line: 'HACKED' })
        .eq('id', schoolAId)
        .select()
      expect(data).toEqual([])
    })

    it("another School's Owner cannot change this School's header", async () => {
      const { data } = await ownerB
        .from('schools')
        .update({ mobile: '999' })
        .eq('id', schoolAId)
        .select()
      expect(data).toEqual([])
    })
  })

  describe('school-logos bucket', () => {
    it('the Owner uploads into their own folder and reads it back', async () => {
      const path = `${schoolAId}/logo.png`
      const { error } = await ownerA.storage
        .from('school-logos')
        .upload(path, PNG_1PX, { contentType: 'image/png', upsert: true })
      expect(error).toBeNull()

      const { data: signed, error: signErr } = await ownerA.storage
        .from('school-logos')
        .createSignedUrl(path, 60)
      expect(signErr).toBeNull()
      expect(signed?.signedUrl).toBeTruthy()
    })

    it("another School's Owner can neither read nor overwrite that object", async () => {
      const path = `${schoolAId}/logo.png`
      const { error: readErr } = await ownerB.storage.from('school-logos').createSignedUrl(path, 60)
      expect(readErr).not.toBeNull()

      const { error: writeErr } = await ownerB.storage
        .from('school-logos')
        .upload(path, PNG_1PX, { contentType: 'image/png', upsert: true })
      expect(writeErr).not.toBeNull()
    })

    it('a Staff User may read the logo (printables need it) but not replace it', async () => {
      const path = `${schoolAId}/logo.png`
      const { data: signed } = await staff.storage.from('school-logos').createSignedUrl(path, 60)
      expect(signed?.signedUrl).toBeTruthy()

      const { error: writeErr } = await staff.storage
        .from('school-logos')
        .upload(`${schoolAId}/logo-staff.png`, PNG_1PX, { contentType: 'image/png' })
      expect(writeErr).not.toBeNull()
    })

    it('rejects a non-image upload (bucket mime allow-list)', async () => {
      const { error } = await ownerA.storage
        .from('school-logos')
        .upload(`${schoolAId}/logo.pdf`, new Uint8Array([1, 2, 3]), {
          contentType: 'application/pdf',
          upsert: true,
        })
      expect(error).not.toBeNull()
    })
  })
})
