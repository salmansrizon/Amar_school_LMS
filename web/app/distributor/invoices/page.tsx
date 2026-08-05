import Link from 'next/link'
import { getDistributorContext } from '@/lib/distributor/context'
import { formatTaka } from '@/lib/money'

// Distributor invoices (#319). Own invoices via RLS (distributor_id = auth.uid()).
export default async function DistributorInvoicesPage() {
  const { supabase } = await getDistributorContext()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, number, status, total_amount, issued_at, due_at')
    .order('issued_at', { ascending: false })

  const statusTone: Record<string, string> = {
    draft: 'bg-paper-muted text-ink',
    issued: 'bg-amber-50 text-amber-700',
    paid: 'bg-emerald-50 text-emerald-700',
    void: 'bg-alert-soft text-alert-deep',
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <h1 className="mb-4 text-2xl font-extrabold">Invoices</h1>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <ul className="divide-y divide-line">
          {invoices?.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-3 text-sm">
              <Link href={`/distributor/invoices/${inv.id}`} className="font-mono text-xs font-semibold hover:text-brand-600">
                {inv.number}
              </Link>
              <span className="flex items-center gap-3">
                <span className="font-semibold">{formatTaka(inv.total_amount)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[inv.status] ?? 'bg-paper-muted text-ink'}`}>
                  {inv.status}
                </span>
              </span>
            </li>
          ))}
          {!invoices?.length && <li className="py-6 text-center text-muted">No invoices yet.</li>}
        </ul>
      </section>
    </main>
  )
}
