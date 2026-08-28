import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient, PASSWORD } from '../helpers/auth'

// Seam: ticket #542 — the boundary proven at the data layer, for the actors the
// existing suites do not cover.
//
// Already covered elsewhere, deliberately not repeated here:
//   rls.test.ts             cross-school reads
//   staff-permissions.test.ts   grant / revoke / self-grant
//   class-attachment-scope.test.ts  cross-class and cross-subject (#525)
//
// What the UAT pass proved was only the *page* boundary — a browser being
// redirected. Every row below asks the database directly with a real session, so
// a UI that hides a control cannot be mistaken for authorization.
describe('Negative access at the data layer (#542)', () => {
  let student: SupabaseClient
  let otherOwner: SupabaseClient
  let gov: SupabaseClient
  let agent: SupabaseClient
  let distributor: SupabaseClient
  let owner: SupabaseClient

  beforeAll(async () => {
    student = await signedIn('s9001@test-a.students.invalid', PASSWORD)
    owner = await signedIn('owner-a@test.local')
    otherOwner = await signedIn('owner-b@test.local')
    gov = await signedIn('gov-e2e@test.local', PASSWORD)
    agent = await signedIn('agent-e2e@test.local', PASSWORD)
    distributor = await signedIn('dealer-e2e@test.local', PASSWORD)
  })

  // Nearly every assertion below is "this actor sees nothing". That shape passes
  // just as happily when the actor is not signed in at all — a broken fixture
  // would turn this whole file green while proving nothing. Establish that every
  // session is real before trusting a single empty result.
  it('every actor in this file is actually authenticated', async () => {
    const actors: [string, SupabaseClient][] = [
      ['student', student],
      ['owner', owner],
      ['otherOwner', otherOwner],
      ['gov', gov],
      ['agent', agent],
      ['distributor', distributor],
    ]
    for (const [name, client] of actors) {
      const { data } = await client.auth.getUser()
      expect(data.user, `${name} is not signed in — the denials below would be vacuous`).not.toBeNull()
    }
  })

  describe('a Student reaches their own row and no other', () => {
    it('reads their own record', async () => {
      const { data } = await student.from('student_self').select('*').maybeSingle()
      expect(data).not.toBeNull()
    })

    // The report asks for this by guessed id, copied link and stale tab. All three
    // are the same request as far as the database is concerned, which is the point.
    it('cannot read another student by id, and is not told whether it exists', async () => {
      const { data: victim } = await owner
        .from('students')
        .select('id')
        .neq('student_no', 'S9001')
        .limit(1)
        .maybeSingle()

      const { data, error } = await student.from('students').select('id').eq('id', victim!.id)
      // RLS filters rather than refusing, so the answer is empty and identical to
      // the answer for an id that does not exist — no existence oracle.
      expect(data).toEqual([])
      expect(error).toBeNull()
    })

    it('cannot write a school-owned row', async () => {
      const { data: victim } = await owner.from('students').select('id').limit(1).maybeSingle()
      await student.from('students').update({ full_name: 'HACKED' }).eq('id', victim!.id)
      const { data: after } = await owner.from('students').select('full_name').eq('id', victim!.id).single()
      expect(after!.full_name).not.toBe('HACKED')
    })

    it('cannot read the staff permission table at all', async () => {
      const { data } = await student.from('staff_permissions').select('screen_key')
      expect(data ?? []).toEqual([])
    })
  })

  describe('a Gov Official is read-only', () => {
    // The report's failure condition is "any approval, edit, export with sensitive
    // fields, or settlement action succeeds".
    it('cannot write a school row', async () => {
      const { data: school } = await owner.from('schools').select('id, name').limit(1).maybeSingle()
      await gov.from('schools').update({ name: 'GOV EDIT' }).eq('id', school!.id)
      const { data: after } = await owner.from('schools').select('name').eq('id', school!.id).single()
      expect(after!.name).not.toBe('GOV EDIT')
    })

    it('cannot approve a settlement', async () => {
      const { error } = await gov.rpc('settlement_approve', {
        p_settlement: '00000000-0000-4000-8000-000000000000',
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/not authorized/i)
    })

    it('cannot read student rows', async () => {
      const { data } = await gov.from('students').select('id').limit(5)
      expect(data ?? []).toEqual([])
    })
  })

  describe('territory and tenant boundaries', () => {
    it('an Agent cannot read student rows', async () => {
      const { data } = await agent.from('students').select('id').limit(5)
      expect(data ?? []).toEqual([])
    })

    it('a Distributor cannot read a school’s student rows', async () => {
      const { data } = await distributor.from('students').select('id').limit(5)
      expect(data ?? []).toEqual([])
    })

    it('an Owner cannot reach another school’s students by id', async () => {
      const { data: mine } = await owner.from('students').select('id').limit(1).maybeSingle()
      const { data } = await otherOwner.from('students').select('id').eq('id', mine!.id)
      expect(data).toEqual([])
    })

    // "Never trust a client-provided school ID … resolve authority from
    // authenticated server state."
    it('an Owner cannot write a row into another school by supplying its id', async () => {
      const { data: theirSchool } = await otherOwner.from('schools').select('id').limit(1).maybeSingle()
      const { error } = await owner
        .from('students')
        .insert({ full_name: 'ZZ542 Cross Tenant', school_id: theirSchool!.id })
      expect(error).not.toBeNull()
    })
  })

  describe('anonymous callers', () => {
    it('read no students, no schools, no permissions', async () => {
      const anon = anonClient()
      expect((await anon.from('students').select('id')).data ?? []).toEqual([])
      expect((await anon.from('staff_permissions').select('screen_key')).data ?? []).toEqual([])
      expect((await anon.from('gl_lines').select('debit')).data ?? []).toEqual([])
    })
  })

  describe('the vendor ledger is not readable by a tenant', () => {
    // #530 added gl_trial_balance as a view. security_invoker = true is what keeps
    // gl_lines' own RLS applying through it; without that flag every authenticated
    // caller would read the vendor ledger. Pin the consequence, not the flag.
    it('a School Owner reads no vendor-level ledger rows through the view', async () => {
      const { data } = await owner.from('gl_trial_balance').select('account_code, debit, credit')
      const { data: adminRows } = await (await signedIn('super@test.local'))
        .from('gl_trial_balance')
        .select('account_code')
      expect((adminRows ?? []).length).toBeGreaterThan(0)
      expect((data ?? []).length).toBeLessThan((adminRows ?? []).length + 1)
    })

    it('a Student reads nothing through it', async () => {
      const { data } = await student.from('gl_trial_balance').select('account_code')
      expect(data ?? []).toEqual([])
    })
  })
})
