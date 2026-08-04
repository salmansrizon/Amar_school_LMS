import { getDistributorContext } from '@/lib/distributor/context'
import { loadDistributorWallet } from '@/lib/distributor/wallet'
import { formatTaka } from '@/lib/money'

// Distributor wallet (#271 / wallets 0083). Balance + recent ledger, RLS-scoped
// to wallets owned by the signed-in distributor.
export default async function WalletPage() {
  const { supabase, userId } = await getDistributorContext()

  const { balance, entries } = await loadDistributorWallet(supabase, userId)

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-4 text-2xl font-extrabold">Wallet</h1>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="text-sm text-muted">Current balance</div>
        <div className="text-3xl font-extrabold text-brand-700">{formatTaka(balance)}</div>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Recent activity</h2>
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium">{e.reason}</div>
                <div className="text-xs text-muted">
                  {new Date(e.created_at).toLocaleString('en-GB')}
                </div>
              </div>
              {e.amount != null && (
                <span
                  className={`font-semibold ${e.amount >= 0 ? 'text-emerald-600' : 'text-alert-deep'}`}
                >
                  {e.amount >= 0 ? '+' : '−'}
                  {formatTaka(Math.abs(e.amount))}
                </span>
              )}
            </li>
          ))}
          {!entries.length && <li className="py-2 text-sm text-muted">No wallet activity.</li>}
        </ul>
      </section>
    </main>
  )
}
