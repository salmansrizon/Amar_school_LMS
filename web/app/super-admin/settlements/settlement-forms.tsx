'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { runSettlement, approveSettlement } from './actions'

const input = 'h-10 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'

export function RunSettlementForm({ distributors }: { distributors: { id: string; name: string }[] }) {
  const { error, pending, onSubmit } = useCrudAction(runSettlement, { resetOnSuccess: true })
  return (
    <form className="grid gap-2 sm:grid-cols-4" onSubmit={onSubmit}>
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
      <input type="date" name="period_start" required className={input} title="Period start" />
      <input type="date" name="period_end" required className={input} title="Period end" />
      <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        Run settlement
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}

export function ApproveSettlementButton({ id, ledgerBalanced = true }: { id: string; ledgerBalanced?: boolean }) {
  const { error, pending, run } = useCrudAction(approveSettlement)
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      {/* #530: settlement_approve refuses server-side when debits and credits
          disagree. Saying so here means the operator learns before clicking
          rather than from a raised exception. */}
      {!ledgerBalanced && <span className="text-xs text-alert-deep">Ledger out of balance</span>}
      <button
        type="button"
        title={ledgerBalanced ? undefined : 'The general ledger is out of balance — reconcile it before paying a settlement.'}
        disabled={pending || !ledgerBalanced}
        onClick={() => {
          const d = new FormData()
          d.set('id', id)
          run(d)
        }}
        className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        Approve &amp; pay
      </button>
    </span>
  )
}
