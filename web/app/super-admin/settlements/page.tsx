import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { formatTaka } from '@/lib/money'
import { accruedByDistributor } from '@/lib/super-admin/ledger-view'
import { RunSettlementForm, ApproveSettlementButton } from './settlement-forms'
import { railClass, type Tone } from '@/components/ui/page'
import { selectAllRows } from '@/lib/supabase/select-all'

// Settlements CRUD (#297, over #271 viewer). Run a settlement (bundles accrued
// commissions) and approve/pay it (GL payout + SettlementCompleted) via RPC.
export default async function SettlementsPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: settlements }, { data: commissions }, { data: distributors }, { data: balanced }] = await Promise.all([
    supabase
      .from('settlements')
      .select('id, distributor_id, period_start, period_end, total_amount, status, profiles(full_name)')
      .order('period_end', { ascending: false })
      .limit(100),
    // Paged (#546): this total is the amount an operator approves and pays.
    selectAllRows<{ distributor_id: string; commission_amount: number; status: string }>((from, to) =>
      supabase.from('commissions').select('distributor_id, commission_amount, status').range(from, to),
    ).then(({ rows }) => ({ data: rows })),
    supabase.from('profiles').select('id, full_name').eq('role', 'distributor').order('full_name'),
    // #530: settlement_approve refuses outright when the ledger does not balance.
    // The button follows the boundary rather than defining it — a disabled control
    // is a courtesy, the RPC is the gate.
    supabase.rpc('gl_is_balanced'),
  ])
  const ledgerBalanced = balanced !== false

  const accrued = accruedByDistributor(commissions ?? [])
  const distributorOptions = (distributors ?? []).map((d) => ({ id: d.id, name: d.full_name ?? d.id.slice(0, 8) }))

  const statusTone: Record<string, string> = {
    draft: 'bg-paper-muted text-ink',
    approved: 'bg-sun-soft text-sun-deep',
    paid: 'bg-mint-soft text-mint-deep',
  }
  const statusRail: Record<string, Tone> = {
    draft: 'muted',
    approved: 'sun',
    paid: 'mint',
  }
  const name = (s: { profiles?: { full_name?: string | null } | null; distributor_id: string }) =>
    s.profiles?.full_name ?? s.distributor_id.slice(0, 8)

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Settlements</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Run a settlement</h2>
        <RunSettlementForm distributors={distributorOptions} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
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
                  <td className={`py-2 pr-4 font-medium ${railClass(statusRail[s.status] ?? 'muted')}`}>
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
                    {s.status === 'draft' && <ApproveSettlementButton id={s.id} ledgerBalanced={ledgerBalanced} />}
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
