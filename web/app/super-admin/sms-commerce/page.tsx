import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { formatTaka } from '@/lib/money'
import { AddPackageForm, PackageRowActions, RateForm } from './sms-forms'

type JsonText = { en?: string; bn?: string } | null
const en = (x: JsonText, fallback: string) => x?.en ?? fallback

// SMS commerce config (#271 / sms-commerce 0084). Sellable packages, per-route
// segment rates, and every school's SMS wallet segment balance.
export default async function SmsCommercePage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: packages }, { data: rates }, { data: wallets }] = await Promise.all([
    supabase.from('sms_packages').select('id, name, segments, price, active').order('segments'),
    supabase.from('sms_rate_config').select('route, amount').order('route'),
    supabase
      .from('wallets')
      .select('id, schools(name)')
      .eq('wallet_type', 'school_sms'),
  ])

  const walletIds = (wallets ?? []).map((w) => w.id)
  const segmentBalance = new Map<string, number>()
  if (walletIds.length) {
    const { data: entries } = await supabase
      .from('wallet_ledger_entries')
      .select('wallet_id, quantity')
      .in('wallet_id', walletIds)
    for (const e of entries ?? []) {
      segmentBalance.set(e.wallet_id, (segmentBalance.get(e.wallet_id) ?? 0) + (e.quantity ?? 0))
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">SMS Commerce</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Segment rates (৳ per segment)</h2>
        <div className="space-y-2">
          {(['mask', 'non_mask'] as const).map((route) => {
            const existing = rates?.find((r) => r.route === route)
            return (
              <RateForm
                key={route}
                route={route}
                amountTaka={existing ? (existing.amount / 100).toString() : ''}
              />
            )
          })}
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Add a package</h2>
        <AddPackageForm />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Packages</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Package</th>
                <th className="py-2 pr-4">Segments</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {packages?.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-4 font-medium">{en(p.name as JsonText, 'Package')}</td>
                  <td className="py-2 pr-4">{p.segments.toLocaleString('en-US')}</td>
                  <td className="py-2 pr-4">{formatTaka(p.price)}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-paper-muted text-ink'}`}
                    >
                      {p.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <PackageRowActions id={p.id} active={p.active} />
                  </td>
                </tr>
              ))}
              {!packages?.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    No packages defined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">School SMS wallets</h2>
        <ul className="divide-y divide-line">
          {(wallets as { id: string; schools?: { name?: string | null } | null }[] | null)?.map((w) => (
            <li key={w.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">{w.schools?.name ?? w.id.slice(0, 8)}</span>
              <span className="font-semibold">
                {(segmentBalance.get(w.id) ?? 0).toLocaleString('en-US')} seg
              </span>
            </li>
          ))}
          {!wallets?.length && <li className="py-2 text-sm text-muted">No school SMS wallets.</li>}
        </ul>
      </section>
    </main>
  )
}
