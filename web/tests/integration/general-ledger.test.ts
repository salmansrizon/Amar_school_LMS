import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { postLedgerEntry } from '@/lib/engines/financial/ledger'

// General Ledger (map #258, #266) against live Supabase: balanced double-entry,
// unbalanced rejection, idempotency, immutability, tenant RLS, authority.
describe('General Ledger (#266)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let schoolA: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
  })

  it('posts a balanced entry and rejects an unbalanced one', async () => {
    const id = await postLedgerEntry(superClient, {
      ref: `test-bal-${crypto.randomUUID()}`,
      memo: 'subscription',
      schoolId: schoolA,
      lines: [
        { accountCode: '1000', debit: 10000, credit: 0 },
        { accountCode: '4000', debit: 0, credit: 10000 },
      ],
    })
    expect(id).toBeTruthy()

    await expect(
      postLedgerEntry(superClient, {
        ref: `test-unbal-${crypto.randomUUID()}`,
        memo: 'bad',
        schoolId: schoolA,
        lines: [
          { accountCode: '1000', debit: 10000, credit: 0 },
          { accountCode: '4000', debit: 0, credit: 9000 },
        ],
      }),
    ).rejects.toThrow()
  })

  it('is idempotent on ref (no duplicate lines)', async () => {
    const ref = `test-idem-${crypto.randomUUID()}`
    const line = [
      { accountCode: '1000', debit: 5000, credit: 0 },
      { accountCode: '4100', debit: 0, credit: 5000 },
    ]
    const first = await postLedgerEntry(superClient, { ref, memo: 'sms', schoolId: schoolA, lines: line })
    const second = await postLedgerEntry(superClient, { ref, memo: 'sms', schoolId: schoolA, lines: line })
    expect(second).toBe(first)
    const lines = (await superClient.from('gl_lines').select('id').eq('entry_id', first)).data ?? []
    expect(lines).toHaveLength(2)
  })

  it('is immutable — update/delete are no-ops', async () => {
    const ref = `test-immut-${crypto.randomUUID()}`
    const id = await postLedgerEntry(superClient, {
      ref, memo: 'x', schoolId: schoolA,
      lines: [{ accountCode: '1000', debit: 100, credit: 0 }, { accountCode: '4000', debit: 0, credit: 100 }],
    })
    await superClient.from('gl_entries').update({ memo: 'tampered' }).eq('id', id)
    const row = (await superClient.from('gl_entries').select('memo').eq('id', id).single()).data
    expect(row!.memo).toBe('x')
    await superClient.from('gl_entries').delete().eq('id', id)
    const still = (await superClient.from('gl_entries').select('id').eq('id', id)).data ?? []
    expect(still).toHaveLength(1)
  })

  it('scopes ledger reads by tenant and blocks non-super posting', async () => {
    const ref = `test-rls-${crypto.randomUUID()}`
    const id = await postLedgerEntry(superClient, {
      ref, memo: 'scoped', schoolId: schoolA,
      lines: [{ accountCode: '1000', debit: 200, credit: 0 }, { accountCode: '4000', debit: 0, credit: 200 }],
    })
    const mine = (await owner.from('gl_entries').select('id').eq('id', id)).data ?? []
    expect(mine).toHaveLength(1)
    const theirs = (await ownerB.from('gl_entries').select('id').eq('id', id)).data ?? []
    expect(theirs).toHaveLength(0)

    await expect(
      postLedgerEntry(owner, {
        ref: `test-deny-${crypto.randomUUID()}`,
        memo: 'nope',
        schoolId: schoolA,
        lines: [{ accountCode: '1000', debit: 1, credit: 0 }, { accountCode: '4000', debit: 0, credit: 1 }],
      }),
    ).rejects.toThrow()
  })
})
