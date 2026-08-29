import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { listSmsPackages, purchaseSmsPackage } from '@/lib/sms/commerce'

// SMS Commerce (map #258, #268) against live Supabase: wallet-backed balance
// (via the retired-to-view ledger), dual-deduct send, package purchase ->
// invoice + allocation, and legacy read-compat views.
describe('SMS Commerce (#268)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let schoolA: string
  let packageId: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    const { data } = await superClient
      .from('sms_packages')
      .insert({ name: { en: 'Test 100' }, segments: 100, price: 20000 })
      .select('id')
      .single()
    packageId = data!.id
  })

  afterAll(async () => {
    await superClient.from('sms_packages').delete().eq('id', packageId)
  })

  it('tops up a school and reflects the balance via the RPC + legacy view', async () => {
    const before = (await owner.rpc('sms_balance_for', { sid: schoolA })).data as number
    await superClient.rpc('sms_topup', { sid: schoolA, segs: 50, amount_taka: 100, note: 'test' })
    const after = (await owner.rpc('sms_balance_for', { sid: schoolA })).data as number
    expect(after).toBe(before + 50)

    // Legacy read view still works (school reads own rows).
    const rows = (await owner.from('sms_credit_ledger').select('delta, reason').eq('school_id', schoolA)).data ?? []
    expect(rows.some((r) => r.reason === 'topup' && r.delta === 50)).toBe(true)
  })

  it('dual-deducts school + company pool on a send', async () => {
    const schoolBefore = (await superClient.rpc('sms_balance_for', { sid: schoolA })).data as number
    const poolBefore = (await superClient.rpc('sms_pool_balance')).data as number
    await superClient.rpc('sms_record_debit', { sid: schoolA, segs: 10, job_secret: null, p_route: 'mask' })
    expect((await superClient.rpc('sms_balance_for', { sid: schoolA })).data as number).toBe(schoolBefore - 10)
    expect((await superClient.rpc('sms_pool_balance')).data as number).toBe(poolBefore - 10)
  })

  it('purchases a package: issues an invoice and allocates segments', async () => {
    const before = (await owner.rpc('sms_balance_for', { sid: schoolA })).data as number
    const packages = await listSmsPackages(superClient)
    expect(packages.some((p) => p.id === packageId)).toBe(true)

    const idempotencyKey = `sms-test-${crypto.randomUUID()}`
    const invoiceId = await purchaseSmsPackage(superClient, { schoolId: schoolA, packageId, idempotencyKey })
    const inv = (await superClient.from('invoices').select('income_account, total_amount').eq('id', invoiceId).single()).data!
    expect(inv.income_account).toBe('4100')
    expect(Number(inv.total_amount)).toBe(20000)
    const after = (await owner.rpc('sms_balance_for', { sid: schoolA })).data as number
    expect(after).toBe(before + 100)

    const retryInvoiceId = await purchaseSmsPackage(superClient, { schoolId: schoolA, packageId, idempotencyKey })
    expect(retryInvoiceId).toBe(invoiceId)
    expect((await owner.rpc('sms_balance_for', { sid: schoolA })).data as number).toBe(after)

    await superClient.from('sms_packages').update({ active: false }).eq('id', packageId)
    expect(await purchaseSmsPackage(superClient, { schoolId: schoolA, packageId, idempotencyKey })).toBe(invoiceId)
    await superClient.from('sms_packages').update({ active: true }).eq('id', packageId)
  })

  it('exposes route rate config', async () => {
    const rows = (await owner.from('sms_rate_config').select('route, amount')).data ?? []
    expect(rows.find((r) => r.route === 'mask')).toBeTruthy()
    expect(rows.find((r) => r.route === 'non_mask')).toBeTruthy()
  })
})
