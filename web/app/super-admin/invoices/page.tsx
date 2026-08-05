import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { formatTaka } from '@/lib/money'
import { BillDistributorForm } from './bill-distributor-form'

// Invoices + payments (#271 viewer + #319 distributor billing). School and
// distributor invoices; issue a single-line distributor invoice inline.
export default async function InvoicesPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: invoices }, { data: payments }, { data: distributors }] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        'id, number, status, total_amount, issued_at, due_at, schools(name), distributor:profiles!invoices_distributor_id_fkey(full_name)',
      )
      .order('issued_at', { ascending: false })
      .limit(100),
    supabase.from('payments').select('invoice_id, amount, status'),
    supabase.from('profiles').select('id, full_name').eq('role', 'distributor').order('full_name'),
  ])

  const distributorOptions = (distributors ?? []).map((d) => ({ id: d.id, name: d.full_name ?? d.id.slice(0, 8) }))

  const paidByInvoice = new Map<string, number>()
  for (const p of payments ?? []) {
    if (p.status === 'confirmed') {
      paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount)
    }
  }

  const statusTone: Record<string, string> = {
    draft: 'bg-paper-muted text-ink',
    issued: 'bg-amber-50 text-amber-700',
    paid: 'bg-emerald-50 text-emerald-700',
    void: 'bg-alert-soft text-alert-deep',
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Invoices</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Bill a distributor</h2>
        <BillDistributorForm distributors={distributorOptions} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Invoice</th>
                <th className="py-2 pr-4">Party</th>
                <th className="py-2 pr-4 text-right">Total</th>
                <th className="py-2 pr-4 text-right">Paid</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(invoices as {
                id: string
                number: string
                status: string
                total_amount: number
                schools?: { name?: string | null } | null
                distributor?: { full_name?: string | null } | null
              }[] | null)?.map(
                (inv) => (
                  <tr key={inv.id}>
                    <td className="py-2 pr-4 font-mono text-xs font-semibold">{inv.number}</td>
                    <td className="py-2 pr-4 font-medium">
                      {inv.schools?.name ?? inv.distributor?.full_name ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-right">{formatTaka(inv.total_amount)}</td>
                    <td className="py-2 pr-4 text-right text-muted">
                      {formatTaka(paidByInvoice.get(inv.id) ?? 0)}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[inv.status] ?? 'bg-paper-muted text-ink'}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ),
              )}
              {!invoices?.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    No invoices issued.
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
