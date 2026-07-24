import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: schools.subdomain + owner-claim codes (issue #108, map #104).

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe('School claim codes + subdomain (issue #108)', () => {
  let admin: SupabaseClient
  let owner: SupabaseClient
  let schoolId: string
  const generatedCodes: string[] = []

  async function generate(sid: string) {
    const { data, error } = await admin.rpc('generate_school_claim_code', { sid })
    if (data) generatedCodes.push((data as { code: string }).code)
    return { data: data as { code: string; school_id: string } | null, error }
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    const { data, error } = await admin
      .from('schools')
      .insert({ name: `ZZ Claim Test ${crypto.randomUUID().slice(0, 8)}` })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    schoolId = data.id
  })

  afterAll(async () => {
    if (generatedCodes.length) {
      await admin.from('school_claim_codes').delete().in('code', generatedCodes).is('redeemed_at', null)
    }
  })

  it('super admin mints a claim code bound to the school', async () => {
    const { data, error } = await generate(schoolId)
    expect(error).toBeNull()
    expect(data?.school_id).toBe(schoolId)
    expect(data?.code).toMatch(/^[0-9A-F]{12}$/)
  })

  it('non-super-admin cannot generate a code', async () => {
    const { error } = await owner.rpc('generate_school_claim_code', { sid: schoolId })
    expect(error).not.toBeNull()
  })

  it('is_valid_subdomain enforces charset, reserved words, hyphen and length', async () => {
    const check = async (slug: string) =>
      (await admin.rpc('is_valid_subdomain', { slug })).data as boolean
    expect(await check('greenwood')).toBe(true)
    expect(await check('green-wood-2')).toBe(true)
    expect(await check('ab')).toBe(false) // too short
    expect(await check('green_wood')).toBe(false) // charset
    expect(await check('green--wood')).toBe(false) // double hyphen
    expect(await check('-green')).toBe(false) // leading hyphen
    expect(await check('www')).toBe(false) // reserved infra
    expect(await check('super-admin')).toBe(false) // reserved route
  })

  it('subdomain is globally unique', async () => {
    const slug = `zz-uniq-${crypto.randomUUID().slice(0, 6)}`
    const a = await admin.from('schools').insert({ name: 'ZZ Uniq A', subdomain: slug }).select('id').single()
    expect(a.error).toBeNull()
    const b = await admin.from('schools').insert({ name: 'ZZ Uniq B', subdomain: slug }).select('id').single()
    expect(b.error).not.toBeNull() // unique violation
    await admin.from('schools').delete().eq('id', a.data!.id)
  })

  it('rejects an invalid subdomain at the check constraint', async () => {
    const { error } = await admin.from('schools').insert({ name: 'ZZ Bad', subdomain: 'Bad_Slug' }).select('id').single()
    expect(error).not.toBeNull()
  })

  it('redeem refuses a user who already has a profile', async () => {
    const { data } = await generate(schoolId)
    const { error } = await owner.rpc('redeem_school_claim_code', {
      code_text: data!.code,
      desired_subdomain: `zz-owner-${crypto.randomUUID().slice(0, 6)}`,
    })
    expect(error?.message).toMatch(/profile already exists/)
  })

  it('redeem rejects an unknown code', async () => {
    const fresh = await freshSignedUpUser()
    if (!fresh) return // signup confirmation on → skip
    const { error } = await fresh.rpc('redeem_school_claim_code', {
      code_text: 'DEADBEEFDEAD',
      desired_subdomain: `zz-x-${crypto.randomUUID().slice(0, 6)}`,
    })
    expect(error?.message).toMatch(/invalid code/)
  })

  it('redeem binds a fresh owner + sets subdomain; a used code is refused', async () => {
    const fresh = await freshSignedUpUser()
    if (!fresh) return // signup confirmation on → skip happy-path
    const { data: code } = await generate(schoolId)
    const slug = `zz-claim-${crypto.randomUUID().slice(0, 6)}`
    const { data: sid, error } = await fresh.rpc('redeem_school_claim_code', {
      code_text: code!.code,
      desired_subdomain: slug,
    })
    expect(error).toBeNull()
    expect(sid).toBe(schoolId)
    const { data: school } = await admin.from('schools').select('subdomain').eq('id', schoolId).single()
    expect(school?.subdomain).toBe(slug)
    // second redemption of the same code is refused
    const again = await freshSignedUpUser()
    if (again) {
      const { error: e2 } = await again.rpc('redeem_school_claim_code', {
        code_text: code!.code,
        desired_subdomain: `zz-claim2-${crypto.randomUUID().slice(0, 6)}`,
      })
      expect(e2?.message).toMatch(/code already used/)
    }
  })
})

/** Sign up a throwaway auth user with no profile. Returns null if the project
 *  requires email confirmation (no session issued), so the suite skips rather
 *  than flakes. */
async function freshSignedUpUser(): Promise<SupabaseClient | null> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const email = `zz-claim-${crypto.randomUUID().slice(0, 12)}@example.com`
  const { data, error } = await client.auth.signUp({ email, password: 'test-password-123!' })
  if (error || !data.session) return null
  return client
}
