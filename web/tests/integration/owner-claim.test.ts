import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { schoolFixtures } from '../helpers/school-fixture'
import { signedIn } from '../helpers/auth'

// Seam: owner onboarding — redeem picks a subdomain (issue #112).

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function freshUser(): Promise<SupabaseClient | null> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const email = `zz-onboard-${crypto.randomUUID().slice(0, 12)}@example.com`
  const { data, error } = await client.auth.signUp({ email, password: 'test-password-123!' })
  if (error || !data.session) return null
  return client
}

describe('Owner claim onboarding (issue #112)', () => {
  let admin: SupabaseClient
  let takenSlug: string

  const schools = schoolFixtures(() => admin)

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    takenSlug = `zz-taken-${crypto.randomUUID().slice(0, 6)}`
    // School A already owns takenSlug.
    await schools.create({ name: 'ZZ Onboard A', subdomain: takenSlug })
  })

  // #541: schools created here — including the two minted mid-test — used to
  // survive the run and keep accruing invoices from the billing sweep.
  afterAll(schools.cleanup)

  it('redeem rejects a subdomain already taken by another school', async () => {
    const fresh = await freshUser()
    if (!fresh) return // signup confirmation on → skip

    // School B with a fresh claim code.
    const { data: b } = await admin.from('schools').insert({ name: 'ZZ Onboard B' }).select('id').single()
    schools.track(b?.id)
    const { data: code } = await admin.rpc('generate_school_claim_code', { sid: b!.id })

    const { error } = await fresh.rpc('redeem_school_claim_code', {
      code_text: (code as { code: string }).code,
      desired_subdomain: takenSlug,
    })
    expect(error?.message).toMatch(/subdomain already taken/)
  })

  it('redeem rejects an invalid subdomain shape', async () => {
    const fresh = await freshUser()
    if (!fresh) return
    const { data: b } = await admin.from('schools').insert({ name: 'ZZ Onboard C' }).select('id').single()
    schools.track(b?.id)
    const { data: code } = await admin.rpc('generate_school_claim_code', { sid: b!.id })
    const { error } = await fresh.rpc('redeem_school_claim_code', {
      code_text: (code as { code: string }).code,
      desired_subdomain: 'Bad_Slug',
    })
    expect(error?.message).toMatch(/invalid subdomain/)
  })
})
