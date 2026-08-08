'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { setDistributorStatus } from './status-actions'
import { DISTRIBUTOR_STATUSES } from './statuses'

const tone: Record<string, string> = {
  pending: 'bg-paper-muted text-ink',
  under_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  suspended: 'bg-amber-50 text-amber-700',
  blocked: 'bg-alert-soft text-alert-deep',
}

// Distributor lifecycle controls (#299): current status + a button per other
// status. The RPC audits + emits DistributorApproved on approval.
export function StatusControls({ distributor, current }: { distributor: string; current: string }) {
  const { error, pending, run } = useCrudAction(setDistributorStatus)
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="text-muted">Current:</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[current] ?? 'bg-paper-muted text-ink'}`}>
          {current}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {DISTRIBUTOR_STATUSES.filter((s) => s !== current).map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            onClick={() => {
              const d = new FormData()
              d.set('distributor', distributor)
              d.set('status', s)
              run(d)
            }}
            className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
          >
            → {s}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
