import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { createInvoice } from '@/lib/engines/financial/invoicing'

describe('Readiness decision framework (#554)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let schoolId: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    const user = (await owner.auth.getUser()).data.user!
    schoolId = (await owner.from('profiles').select('school_id').eq('id', user.id).single()).data!.school_id
  })

  it('resolves every unapproved tax treatment as pending and non-calculating', async () => {
    const result = await superClient.rpc('tax_treatment_resolve', { p_supply_type: 'subscription' })
    expect(result.error).toBeNull()
    expect(result.data?.[0]).toMatchObject({ status: 'pending', rate_bp: 0, inclusive: false })

    const unknown = await superClient.rpc('tax_treatment_resolve', {
      p_supply_type: 'subscription', p_customer_type: 'future-buyer',
    })
    expect(unknown.error).toBeNull()
    expect(unknown.data?.[0]).toMatchObject({ status: 'pending', rate_bp: 0, inclusive: false })
  })

  it('keeps tender evidence vendor-only', async () => {
    const profile = (await superClient.rpc('government_tender_profile_create', {
      p_procuring_entity: 'Test procuring entity', p_tender_reference: `TEST-${crypto.randomUUID()}`,
    })).data as string
    const evidence = (await superClient.from('government_tender_evidence').select('evidence_area').eq('profile_id', profile)).data!
    expect(evidence).toHaveLength(12)
    expect((await owner.from('government_tender_profiles').select('id')).data).toEqual([])
    expect((await owner.from('government_tender_evidence').select('id')).data).toEqual([])
  })

  it('creates an immutable pending adjustment without posting GL', async () => {
    const invoiceId = await createInvoice(superClient, {
      schoolId, lines: [{ description: 'framework test', unitAmount: 1000 }],
    })
    const adjustment = await superClient.rpc('invoice_adjustment_create', {
      p_invoice: invoiceId, p_kind: 'credit_note', p_amount: 1000, p_reason: 'framework test',
    })
    expect(adjustment.error).toBeNull()
    const row = (await superClient.from('invoice_adjustments').select('status, amount').eq('id', adjustment.data).single()).data!
    expect(row).toEqual({ status: 'pending', amount: 1000 })
    expect((await superClient.from('gl_entries').select('id').eq('ref', `invoice-adjustment:${adjustment.data}`)).data).toEqual([])
  })

  it('keeps legal profile pending and launch scope explicit', async () => {
    const legal = (await superClient.from('vendor_legal_profile').select('status, legal_entity_name').single()).data!
    expect(legal).toEqual({ status: 'pending', legal_entity_name: null })
    const packageConfig = (await superClient
      .from('launch_package_config')
      .select('status, billing_period, pricing_model, payment_mode, languages, support_response_hours, deferred_capabilities')
      .single()).data!
    expect(packageConfig).toMatchObject({
      status: 'proposed', billing_period: 'monthly', pricing_model: 'hybrid', payment_mode: 'manual',
      languages: ['bn', 'en'], support_response_hours: 24,
    })
    expect(packageConfig.deferred_capabilities).toContain('vat')
    expect((await owner.from('vendor_legal_profile').select('singleton')).data).toEqual([])
    expect((await owner.from('launch_package_config').select('singleton')).data).toEqual([])
  })
})
