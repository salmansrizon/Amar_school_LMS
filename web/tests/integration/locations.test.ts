import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: locations/clusters schema + recursive schools_under_location (issue #3).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Territory & Location hierarchy (issue #3)', () => {
  let admin: SupabaseClient
  let division: string, district: string, upazila: string, union1: string
  let schoolAId: string

  async function addLocation(name: string, type: string, parent: string | null) {
    const { data, error } = await admin
      .from('locations')
      .insert({ name, type, parent_id: parent })
      .select('id')
      .single()
    return { id: data?.id as string | undefined, error }
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    // Clean any tree left from a prior run (cascade wipes descendants).
    await admin.from('locations').delete().eq('name', 'T-Division')

    const d = await addLocation('T-Division', 'division', null)
    expect(d.error).toBeNull()
    division = d.id!
    district = (await addLocation('T-District', 'district', division)).id!
    upazila = (await addLocation('T-Upazila', 'upazila', district)).id!
    union1 = (await addLocation('T-Union', 'union', upazila)).id!

    const { data: schoolA } = await admin.from('schools').select('id').eq('name', 'Test School A').single()
    schoolAId = schoolA!.id
  })

  afterAll(async () => {
    await admin.from('schools').update({ location_id: null, cluster_id: null }).eq('id', schoolAId)
    await admin.from('locations').delete().eq('id', division)
  })

  it('all four levels can be created in order', () => {
    for (const id of [division, district, upazila, union1]) expect(id).toBeTruthy()
  })

  it('a child without a parent is rejected', async () => {
    const { error } = await addLocation('Orphan District', 'district', null)
    expect(error).not.toBeNull()
  })

  it('a child under the wrong parent level is rejected', async () => {
    const { error } = await addLocation('Skip Union', 'union', division)
    expect(error).not.toBeNull()
  })

  it('deleting a node cascades to all descendants', async () => {
    const d2 = (await addLocation('T2-Division', 'division', null)).id!
    const dist2 = (await addLocation('T2-District', 'district', d2)).id!
    await admin.from('locations').delete().eq('id', d2)
    const { data } = await admin.from('locations').select('id').in('id', [d2, dist2])
    expect(data).toEqual([])
  })

  it('a Cluster can be created and a School assigned to it', async () => {
    await admin.from('clusters').delete().eq('name', 'T-Cluster')
    const { data: cluster, error } = await admin
      .from('clusters')
      .insert({ name: 'T-Cluster', location_id: upazila })
      .select('id')
      .single()
    expect(error).toBeNull()
    const { error: assignErr } = await admin
      .from('schools')
      .update({ cluster_id: cluster!.id })
      .eq('id', schoolAId)
    expect(assignErr).toBeNull()
  })

  it('schools_under_location returns Schools at any depth (recursive inclusion)', async () => {
    await admin.from('schools').update({ location_id: union1 }).eq('id', schoolAId)

    for (const node of [division, district, upazila, union1]) {
      const { data, error } = await admin.rpc('schools_under_location', { location: node })
      expect(error).toBeNull()
      expect((data as { id: string }[]).map((s) => s.id)).toContain(schoolAId)
    }
  })

  it('a sibling branch does not include the School', async () => {
    const other = (await addLocation('T-District-2', 'district', division)).id!
    const { data } = await admin.rpc('schools_under_location', { location: other })
    expect((data as { id: string }[]).map((s) => s.id)).not.toContain(schoolAId)
  })

  it('a School Owner cannot create locations', async () => {
    const owner = await signedIn('owner-a@test.local')
    const { error } = await owner
      .from('locations')
      .insert({ name: 'Rogue Division', type: 'division', parent_id: null })
    expect(error).not.toBeNull()
  })
})
