import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { LegalProfileForm } from './legal-profile-form'

type Status = 'pending' | 'proposed' | 'blocked' | 'baseline' | 'ready' | 'approved' | 'retired' | 'expired'

function Badge({ status }: { status: Status | string }) {
  const tone = status === 'approved' || status === 'ready' ? 'bg-mint-50 text-mint-deep' : 'bg-amber-50 text-amber-800'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{status}</span>
}

export default async function ReadinessPage() {
  const { supabase } = await getSuperAdminContext()
  const [{ data: legal }, { data: launch }, { data: taxes }, { data: tenders }] = await Promise.all([
    supabase.from('vendor_legal_profile').select('status, legal_entity_name, tin, bin, registered_address, adviser_evidence').maybeSingle(),
    supabase.from('launch_package_config').select('status, billing_period, pricing_model, payment_mode, languages, support_channel, support_response_hours, included_modules, deferred_capabilities').maybeSingle(),
    supabase.from('tax_treatment_config').select('supply_type, customer_type, status, rate_bp, inclusive').order('supply_type'),
    supabase.from('government_tender_profiles').select('id, procuring_entity, tender_reference, status, government_tender_evidence(status)'),
  ])

  return (
    <main className="w-full p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Commercial Readiness</h1>
          <p className="mt-1 text-sm text-muted">Evidence status only. This screen is not a tax, certification, or tender approval.</p>
        </div>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">← Dashboard</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-paper p-5">
          <div className="flex items-center justify-between"><h2 className="font-bold">Legal profile</h2><Badge status={legal?.status ?? 'pending'} /></div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <dt className="text-muted">Entity</dt><dd>{legal?.legal_entity_name ?? 'Pending external input'}</dd>
            <dt className="text-muted">TIN / BIN</dt><dd>{legal?.tin ?? 'Pending'} / {legal?.bin ?? 'Pending'}</dd>
            <dt className="text-muted">Address</dt><dd>{legal?.registered_address ?? 'Pending external input'}</dd>
          </dl>
          <LegalProfileForm legal={legal} />
        </section>

        <section className="rounded-lg border border-line bg-paper p-5">
          <div className="flex items-center justify-between"><h2 className="font-bold">Launch package</h2><Badge status={launch?.status ?? 'proposed'} /></div>
          <p className="mt-3 text-sm">{launch?.billing_period ?? 'monthly'} / {launch?.pricing_model ?? 'hybrid'} pricing, {launch?.payment_mode ?? 'manual'} payments, {launch?.support_response_hours ?? 24}h target.</p>
          <p className="mt-2 text-xs text-muted">Languages: {(launch?.languages ?? ['bn', 'en']).join(', ')}. Support channel: {launch?.support_channel ?? 'pending'}.</p>
          <p className="mt-3 text-xs text-muted">Included: {(launch?.included_modules ?? []).join(', ')}</p>
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-line bg-paper p-5">
        <div className="flex items-center justify-between"><h2 className="font-bold">Tax treatments</h2><span className="text-xs text-muted">Pending does not calculate VAT</span></div>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-4">Supply</th><th className="py-2 pr-4">Customer</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Rate</th></tr></thead><tbody className="divide-y divide-line">{(taxes ?? []).map((tax) => <tr key={`${tax.supply_type}-${tax.customer_type}`}><td className="py-2 pr-4">{tax.supply_type}</td><td className="py-2 pr-4">{tax.customer_type}</td><td className="py-2 pr-4"><Badge status={tax.status} /></td><td className="py-2 pr-4">{tax.rate_bp} bp</td></tr>)}</tbody></table></div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-paper p-5">
        <div className="flex items-center justify-between"><h2 className="font-bold">Tender evidence</h2><span className="text-xs text-muted">No buyer-specific claim without a named tender</span></div>
        <div className="mt-3 space-y-3">{(tenders ?? []).map((tender) => { const items = (tender.government_tender_evidence ?? []) as { status: string }[]; const ready = items.filter((item) => item.status === 'ready' || item.status === 'approved').length; return <div key={tender.id} className="rounded-md border border-line p-3 text-sm"><div className="flex items-center justify-between"><span className="font-semibold">{tender.procuring_entity} / {tender.tender_reference}</span><Badge status={tender.status} /></div><p className="mt-1 text-xs text-muted">{ready} / {items.length} evidence items ready</p></div> })}{!tenders?.length && <p className="text-sm text-muted">No government buyer or tender selected.</p>}</div>
      </section>
    </main>
  )
}
