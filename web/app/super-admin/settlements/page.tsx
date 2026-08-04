import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { formatTaka } from '@/lib/money'
import { accruedByDistributor } from '@/lib/super-admin/ledger-view'

// Settlements viewer (#271 / commission-settlement 0087). Distributor payout
// periods plus the accrued-but-unsettled commission balance per distributor.
export default async function SettlementsPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: settlements }, { data: commissions }] = await Promise.all([
    supabase
      .from('settlements')
      .select('id, distributor_id, period_start, period_end, total_amount, status, profiles(full_name)')
      .order('period_end', { ascending: false })
      .limit(100),
    supabase.from('commissions').select('distributor_id, commission_amount, status'),
  ])

  const accrued = accruedByDistributor(commissions ?? [])

  const statusTone: Record<string, string> = {
    draft: 'bg-paper-muted text-ink',
    approved: 'bg-amber-50 text-amber-700',
    paid: 'bg-emerald-50 text-emerald-700',
  }
  const name = (s: { profiles?: { full_name?: string | null } | null; distributor_id: string }) =>
    s.profiles?.full_name ?? s.distributor_id.slice(0, 8)

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Settlements</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Distributor</th>
                <th className="py-2 pr-4">Period</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Unsettled</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {settlements?.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-4 font-medium">
                    {name(s as Parameters<typeof name>[0])}
                  </td>
                  <td className="py-2 pr-4 text-muted whitespace-nowrap">
                    {new Date(s.period_start).toLocaleDateString('en-GB')} –{' '}
                    {new Date(s.period_end).toLocaleDateString('en-GB')}
                  </td>
                  <td className="py-2 pr-4 font-semibold">{formatTaka(s.total_amount)}</td>
                  <td className="py-2 pr-4 text-muted">
                    {formatTaka(accrued.get(s.distributor_id) ?? 0)}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[s.status] ?? 'bg-paper-muted text-ink'}`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!settlements?.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    No settlements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
