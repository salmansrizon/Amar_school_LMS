'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import {
  createDefinition,
  setDefinitionActive,
  deleteDefinition,
  createStage,
  deleteStage,
} from './actions'

const input = 'h-10 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'
const ROLES = ['super_admin', 'school_owner', 'staff_user', 'distributor', 'agent', 'gov_official']

export function AddDefinitionForm() {
  const { error, pending, onSubmit } = useCrudAction(createDefinition, { resetOnSuccess: true })
  return (
    <form className="grid gap-2 sm:grid-cols-4" onSubmit={onSubmit}>
      <input name="key" required placeholder="workflow_key" className={`${input} font-mono`} />
      <input name="label_en" placeholder="Label (EN)" className={input} />
      <input name="label_bn" placeholder="লেবেল (BN)" className={input} />
      <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        Add workflow
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}

export function DefinitionActions({ defKey, active }: { defKey: string; active: boolean }) {
  const { error, pending, run } = useCrudAction(setDefinitionActive)
  const del = useCrudAction(deleteDefinition)
  return (
    <span className="flex items-center gap-2">
      {(error || del.error) && <span className="text-xs text-alert-deep">{error ?? del.error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const d = new FormData()
          d.set('key', defKey)
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
          d.set('key', defKey)
          del.run(d)
        }}
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        Delete
      </button>
    </span>
  )
}

export function AddStageForm({ definitionKey }: { definitionKey: string }) {
  const { error, pending, onSubmit } = useCrudAction(createStage, { resetOnSuccess: true })
  return (
    <form className="mt-2 grid gap-2 sm:grid-cols-4" onSubmit={onSubmit}>
      <input type="hidden" name="definition_key" value={definitionKey} />
      <input name="name_en" placeholder="Stage name (EN)" className={input} />
      <input name="name_bn" placeholder="ধাপের নাম (BN)" className={input} />
      <select name="approver_role" defaultValue="" required className={input}>
        <option value="" disabled>
          approver role…
        </option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="h-10 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-paper-muted disabled:opacity-50">
        Add stage
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}

export function DeleteStageButton({ id }: { id: string }) {
  const { pending, run } = useCrudAction(deleteStage)
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const d = new FormData()
        d.set('id', id)
        run(d)
      }}
      className="text-xs font-semibold text-alert-deep hover:underline disabled:opacity-50"
    >
      ✕
    </button>
  )
}
