'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { billDistributor } from './actions'

const input = 'h-10 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'

export function BillDistributorForm({ distributors }: { distributors: { id: string; name: string }[] }) {
  const { error, pending, onSubmit } = useCrudAction(billDistributor, { resetOnSuccess: true })
  return (
    <form className="grid gap-2 sm:grid-cols-5" onSubmit={onSubmit}>
      <select name="distributor" required defaultValue="" className={input}>
        <option value="" disabled>
          Distributor…
        </option>
        {distributors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <input name="description" required placeholder="e.g. SMS credit — 5000 seg" className={`${input} sm:col-span-2`} />
      <input name="amount" required placeholder="Amount ৳" className={input} />
      <select name="income_account" defaultValue="4100" className={input} title="Income account">
        <option value="4100">SMS Income</option>
        <option value="4000">Subscription Income</option>
        <option value="4200">Implementation Income</option>
      </select>
      <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-5 sm:w-auto sm:justify-self-start">
        Issue invoice
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-5">{error}</p>}
    </form>
  )
}
