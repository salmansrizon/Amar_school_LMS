import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { formatTaka } from '@/lib/money'
import { accruedByDistributor } from '@/lib/super-admin/ledger-view'
import { RunSettlementForm, ApproveSettlementButton } from './settlement-forms'

// Settlements CRUD (#297, over #271 viewer). Run a settlement (bundles accrued
// commissions) and approve/pay it (GL payout + SettlementCompleted) via RPC.
export default async function SettlementsPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: settlements }, { data: commissions }, { data: distributors }] = await Promise.all([
    supabase
      .from('settlements')
      .select('id, distributor_id, period_start, period_end, total_amount, status, profiles(full_name)')
      .order('period_end', { ascending: false })
      .limit(100),
    supabase.from('commissions').select('distributor_id, commission_amount, status'),
    supabase.from('profiles').select('id, full_name').eq('role', 'distributor').order('full_name'),
  ])

  const accrued = accruedByDistributor(commissions ?? [])
  const distributorOptions = (distributors ?? []).map((d) => ({ id: d.id, name: d.full_name ?? d.id.slice(0, 8) }))

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

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Run a settlement</h2>
        <RunSettlementForm distributors={distributorOptions} />
      </section>

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
                <th className="py-2 pr-4 text-right">Actions</th>
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
                  <td className="py-2 pr-4 text-right">
                    {s.status === 'draft' && <ApproveSettlementButton id={s.id} />}
                  </td>
                </tr>
              ))}
              {!settlements?.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted">
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
