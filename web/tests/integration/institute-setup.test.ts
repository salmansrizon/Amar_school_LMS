import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Institute Setup & Misc (issue #39, PRD §5.11) — schools profile
// deepening (owner-only update + fixed education-levels check constraint),
// daily_checklists (date-range reporting) and logistics_index, both scoped
// to "school members" (owner + granted Staff User) rather than owner-only.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'
const STAFF_EMAIL = 'staff-a1@test.local'

function anonClient() {
  return createClient(URL, ANON, { auth: { persistSession: false } })
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Institute Setup & Misc (issue #39)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let staff: SupabaseClient
  let schoolAId: string

  const CHECKLIST_DATE = '2026-01-15' // fixed, throwaway date well outside real usage

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    staff = await signedIn(STAFF_EMAIL)

    const { data: userA } = await ownerA.auth.getUser()
    schoolAId = (
      await ownerA.from('profiles').select('school_id').eq('id', userA.user!.id).single()
    ).data!.school_id

    await ownerA.from('daily_checklists').delete().eq('checklist_date', CHECKLIST_DATE)
    await ownerB.from('daily_checklists').delete().eq('checklist_date', CHECKLIST_DATE)
    await ownerA.from('logistics_index').delete().like('item_type', 'IS Test%')
    await ownerB.from('logistics_index').delete().like('item_type', 'IS Test%')
    // Reset profile fields this suite exercises, idempotently.
    await ownerA
      .from('schools')
      .update({ institute_code: null, eiin_no: null, mpo_enlisted: false, mpo_code: null, education_levels: [] })
      .eq('id', schoolAId)
  })

  afterAll(async () => {
    await ownerA.from('daily_checklists').delete().eq('checklist_date', CHECKLIST_DATE)
    await ownerB.from('daily_checklists').delete().eq('checklist_date', CHECKLIST_DATE)
    await ownerA.from('logistics_index').delete().like('item_type', 'IS Test%')
    await ownerB.from('logistics_index').delete().like('item_type', 'IS Test%')
    await ownerA
      .from('schools')
      .update({ institute_code: null, eiin_no: null, mpo_enlisted: false, mpo_code: null, education_levels: [] })
      .eq('id', schoolAId)
  })

  describe('institute profile', () => {
    it('lets the School Owner update their own profile fields', async () => {
      const { error } = await ownerA
        .from('schools')
        .update({
          institute_code: 'ASH-0142',
          eiin_no: '123456',
          mpo_enlisted: true,
          mpo_code: 'MPO-88213',
          education_levels: ['primary', 'secondary'],
        })
        .eq('id', schoolAId)
      expect(error).toBeNull()

      const { data } = await ownerA
        .from('schools')
        .select('institute_code, eiin_no, mpo_enlisted, mpo_code, education_levels')
        .eq('id', schoolAId)
        .single()
      expect(data?.institute_code).toBe('ASH-0142')
      expect(data?.education_levels).toEqual(['primary', 'secondary'])
    })

    it('rejects an education level outside the fixed PRD set', async () => {
      const { error } = await ownerA
        .from('schools')
        .update({ education_levels: ['primary', 'college'] })
        .eq('id', schoolAId)
      expect(error).not.toBeNull()
    })

    it("a Staff User cannot update the school's profile (owner-only policy)", async () => {
      const { data, error } = await staff
        .from('schools')
        .update({ institute_code: 'HACKED' })
        .eq('id', schoolAId)
        .select()
      expect(error).toBeNull()
      expect(data).toEqual([]) // RLS silently excludes the row rather than erroring

      const { data: unchanged } = await ownerA
        .from('schools')
        .select('institute_code')
        .eq('id', schoolAId)
        .single()
      expect(unchanged?.institute_code).toBe('ASH-0142')
    })

    it("another School's Owner cannot update this school's profile", async () => {
      const { data } = await ownerB
        .from('schools')
        .update({ institute_code: 'HACKED-B' })
        .eq('id', schoolAId)
        .select()
      expect(data).toEqual([])
    })
  })

  describe('daily checklist', () => {
    it('lets a school member upsert and then read back today’s checklist', async () => {
      const { error: insertErr } = await ownerA.from('daily_checklists').insert({
        checklist_date: CHECKLIST_DATE,
        flag_hoisted: true,
        anthem_rendered: true,
        assembly_held: true,
        classes_started_on_time: false,
        premises_cleaned: true,
      })
      expect(insertErr).toBeNull()

      const { error: upsertErr } = await ownerA
        .from('daily_checklists')
        .update({ classes_started_on_time: true })
        .eq('checklist_date', CHECKLIST_DATE)
      expect(upsertErr).toBeNull()

      const { data } = await ownerA
        .from('daily_checklists')
        .select('classes_started_on_time')
        .eq('checklist_date', CHECKLIST_DATE)
        .single()
      expect(data?.classes_started_on_time).toBe(true)
    })

    it('a granted Staff User (not just the Owner) can also write checklist rows', async () => {
      const { error } = await staff
        .from('daily_checklists')
        .update({ premises_cleaned: true })
        .eq('checklist_date', CHECKLIST_DATE)
      expect(error).toBeNull()
    })

    it("another School's Owner cannot see this school's checklist row", async () => {
      const { data } = await ownerB
        .from('daily_checklists')
        .select('id')
        .eq('checklist_date', CHECKLIST_DATE)
      expect(data).toEqual([])
    })

    it('one row per School per date (unique constraint)', async () => {
      const { error } = await ownerA
        .from('daily_checklists')
        .insert({ checklist_date: CHECKLIST_DATE })
      expect(error).not.toBeNull()
    })
  })

  describe('logistics index', () => {
    it('lets a school member add and read a logistics entry', async () => {
      const { error } = await ownerA.from('logistics_index').insert({
        item_type: 'IS Test Admission Files',
        year: '2025',
        storage_location: 'Cabinet 2, Shelf 3',
      })
      expect(error).toBeNull()

      const { data } = await ownerA
        .from('logistics_index')
        .select('item_type, storage_location')
        .like('item_type', 'IS Test%')
      expect(data).toHaveLength(1)
      expect(data![0].storage_location).toBe('Cabinet 2, Shelf 3')
    })

    it("another School's Owner cannot see this school's logistics entries", async () => {
      const { data } = await ownerB
        .from('logistics_index')
        .select('id')
        .like('item_type', 'IS Test%')
      expect(data).toEqual([])
    })
  })
})
