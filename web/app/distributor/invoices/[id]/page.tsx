import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDistributorContext } from '@/lib/distributor/context'
import { formatTaka } from '@/lib/money'
import { PrintButton, RecordPaymentForm } from './invoice-controls'

// Distributor invoice detail (#319) — printable, with record-payment. RLS scopes
// the invoice + lines + payments to the distributor party.
export default async function DistributorInvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getDistributorContext()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, number, status, subtotal_amount, tax_amount, total_amount, memo, issued_at, due_at')
    .eq('id', id)
    .maybeSingle()
  if (!invoice) notFound()

  const [{ data: lines }, { data: payments }] = await Promise.all([
    supabase.from('invoice_lines').select('id, description, quantity, unit_amount, amount').eq('invoice_id', id),
    supabase.from('payments').select('id, amount, method, status, created_at').eq('invoice_id', id).order('created_at'),
  ])

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/distributor/invoices" className="text-sm text-brand-600 hover:underline">
          ← Invoices
        </Link>
        <PrintButton />
      </div>

      <section className="rounded-lg border border-line bg-paper p-6 shadow-card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-extrabold">Invoice {invoice.number}</h1>
            <p className="text-xs text-muted">
              Issued {new Date(invoice.issued_at).toLocaleDateString('en-GB')}
              {invoice.due_at ? ` · due ${new Date(invoice.due_at).toLocaleDateString('en-GB')}` : ''}
            </p>
          </div>
          <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold">{invoice.status}</span>
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-muted">
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4 text-right">Qty</th>
              <th className="py-2 pr-4 text-right">Unit</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines?.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-4">{l.description}</td>
                <td className="py-2 pr-4 text-right">{l.quantity}</td>
                <td className="py-2 pr-4 text-right">{formatTaka(l.unit_amount)}</td>
                <td className="py-2 text-right">{formatTaka(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-2 pr-4 text-right text-muted">
                Subtotal
              </td>
              <td className="py-2 text-right">{formatTaka(invoice.subtotal_amount)}</td>
            </tr>
            {invoice.tax_amount > 0 && (
              <tr>
                <td colSpan={3} className="py-1 pr-4 text-right text-muted">
                  Tax
                </td>
                <td className="py-1 text-right">{formatTaka(invoice.tax_amount)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-line-strong font-bold">
              <td colSpan={3} className="py-2 pr-4 text-right">
                Total
              </td>
              <td className="py-2 text-right">{formatTaka(invoice.total_amount)}</td>
            </tr>
          </tfoot>
        </table>

        {invoice.memo && <p className="mt-3 text-sm text-muted">{invoice.memo}</p>}
      </section>

      <section className="mt-4 rounded-lg border border-line bg-paper p-5 shadow-card print:hidden">
        <h2 className="mb-3 font-bold">Payments</h2>
        <ul className="mb-4 divide-y divide-line">
          {payments?.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {formatTaka(p.amount)} · {p.method}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
              >
                {p.status}
              </span>
            </li>
          ))}
          {!payments?.length && <li className="py-2 text-sm text-muted">No payments recorded.</li>}
        </ul>
        {invoice.status !== 'paid' && invoice.status !== 'void' && <RecordPaymentForm invoiceId={invoice.id} />}
      </section>
    </main>
  )
}
