import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { formatTaka } from '@/lib/money'
import { trialBalance } from '@/lib/super-admin/ledger-view'

type Labelled = { code: string; name?: { en?: string; bn?: string } | null; type: string; normal_side: string }

// Central GL trial balance (#271 / general-ledger 0085). Aggregates gl_lines per
// account into debit/credit totals — the vendor accounting ledger view.
export default async function AccountingPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: accounts }, { data: lines }] = await Promise.all([
    supabase.from('gl_accounts').select('code, name, type, normal_side').order('code'),
    supabase.from('gl_lines').select('account_code, debit, credit'),
  ])

  const { perAccount: totals, totalDebit: sumDebit, totalCredit: sumCredit, balanced } =
    trialBalance(lines ?? [])

  const name = (a: Labelled) => a.name?.en ?? a.code

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Accounting Ledger</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Trial Balance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Account</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4 text-right">Debit</th>
                <th className="py-2 pr-4 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {accounts?.map((a) => {
                const t = totals.get(a.code) ?? { debit: 0, credit: 0 }
                return (
                  <tr key={a.code}>
                    <td className="py-2 pr-4">
                      <div className="font-medium">{name(a as Labelled)}</div>
                      <div className="font-mono text-xs text-muted">{a.code}</div>
                    </td>
                    <td className="py-2 pr-4 text-muted">{a.type}</td>
                    <td className="py-2 pr-4 text-right">{t.debit ? formatTaka(t.debit) : '—'}</td>
                    <td className="py-2 pr-4 text-right">{t.credit ? formatTaka(t.credit) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-strong font-bold">
                <td className="py-2 pr-4" colSpan={2}>
                  Total
                </td>
                <td className="py-2 pr-4 text-right">{formatTaka(sumDebit)}</td>
                <td className="py-2 pr-4 text-right">{formatTaka(sumCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!balanced && (
          <p className="mt-3 text-sm font-semibold text-alert-deep">
            ⚠ Ledger out of balance by {formatTaka(Math.abs(sumDebit - sumCredit))}.
          </p>
        )}
      </section>
    </main>
  )
}
