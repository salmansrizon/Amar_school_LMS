'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { recordPayment } from './actions'

const input = 'h-10 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted print:hidden"
    >
      Print
    </button>
  )
}

export function RecordPaymentForm({ invoiceId }: { invoiceId: string }) {
  const { error, pending, onSubmit } = useCrudAction(recordPayment, { resetOnSuccess: true })
  return (
    <form className="grid gap-2 sm:grid-cols-4 print:hidden" onSubmit={onSubmit}>
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input name="amount" required placeholder="Amount ৳" className={input} />
      <select name="method" defaultValue="bank" className={input}>
        <option value="bank">Bank</option>
        <option value="bkash">bKash</option>
        <option value="nagad">Nagad</option>
        <option value="cash">Cash</option>
      </select>
      <input name="reference" placeholder="Reference (optional)" className={input} />
      <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        Record payment
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}
