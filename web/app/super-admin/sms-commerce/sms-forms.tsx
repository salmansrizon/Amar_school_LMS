'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { createPackage, setPackageActive, deletePackage, setRate } from './actions'

const input = 'h-10 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'

export function AddPackageForm() {
  const { error, pending, onSubmit } = useCrudAction(createPackage, { resetOnSuccess: true })
  return (
    <form className="grid gap-2 sm:grid-cols-5" onSubmit={onSubmit}>
      <input name="name_en" placeholder="Name (EN)" className={input} />
      <input name="name_bn" placeholder="নাম (BN)" className={input} />
      <input name="segments" required placeholder="Segments" className={input} />
      <input name="price" required placeholder="Price ৳" className={input} />
      <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        Add package
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-5">{error}</p>}
    </form>
  )
}

export function PackageRowActions({ id, active }: { id: string; active: boolean }) {
  const { error, pending, run } = useCrudAction(setPackageActive)
  const del = useCrudAction(deletePackage)

  return (
    <span className="flex items-center justify-end gap-2">
      {(error || del.error) && <span className="text-xs text-alert-deep">{error ?? del.error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const d = new FormData()
          d.set('id', id)
          d.set('active', String(!active))
          run(d)
        }}
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
      >
        {active ? 'Deactivate' : 'Activate'}
      </button>
      <button
        type="button"
        disabled={del.pending}
        onClick={() => {
          const d = new FormData()
          d.set('id', id)
          del.run(d)
        }}
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        Delete
      </button>
    </span>
  )
}

export function RateForm({ route, amountTaka }: { route: string; amountTaka: string }) {
  const { error, pending, onSubmit } = useCrudAction(setRate)
  return (
    <form className="flex items-center gap-2" onSubmit={onSubmit}>
      <input type="hidden" name="route" value={route} />
      <span className="w-20 text-xs font-semibold text-muted">{route}</span>
      <input name="amount" defaultValue={amountTaka} placeholder="৳ / seg" className={`${input} w-28`} />
      <button type="submit" disabled={pending} className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50">
        Save
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </form>
  )
}
