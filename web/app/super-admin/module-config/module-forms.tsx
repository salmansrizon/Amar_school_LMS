'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import {
  createModule,
  deleteModule,
  createFeature,
  deleteFeature,
  setFeatureState,
  addDependency,
  removeDependency,
} from './actions'

const input = 'h-10 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'
const STATES = ['active', 'disabled', 'trial', 'premium']

export function AddModuleForm() {
  const { error, pending, onSubmit } = useCrudAction(createModule, { resetOnSuccess: true })
  return (
    <form className="grid gap-2 sm:grid-cols-4" onSubmit={onSubmit}>
      <input name="key" required placeholder="module_key" className={`${input} font-mono`} />
      <input name="label_en" placeholder="Label (EN)" className={input} />
      <input name="label_bn" placeholder="লেবেল (BN)" className={input} />
      <input name="sort" type="number" placeholder="Sort" className={input} />
      <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-4 sm:w-auto sm:justify-self-start">
        Add module
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}

export function DeleteModuleButton({ moduleKey }: { moduleKey: string }) {
  const { error, pending, run } = useCrudAction(deleteModule)
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const d = new FormData()
          d.set('key', moduleKey)
          run(d)
        }}
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        Delete module
      </button>
    </span>
  )
}

export function AddFeatureForm({ moduleKey }: { moduleKey: string }) {
  const { error, pending, onSubmit } = useCrudAction(createFeature, { resetOnSuccess: true })
  return (
    <form className="mt-2 grid gap-2 sm:grid-cols-5" onSubmit={onSubmit}>
      <input type="hidden" name="module_key" value={moduleKey} />
      <input name="key" required placeholder="feature_key" className={`${input} font-mono`} />
      <input name="label_en" placeholder="Label (EN)" className={input} />
      <input name="label_bn" placeholder="লেবেল (BN)" className={input} />
      <select name="default_state" defaultValue="active" className={input}>
        {STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="h-10 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-paper-muted disabled:opacity-50">
        Add feature
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-5">{error}</p>}
    </form>
  )
}

export function FeatureRowActions({
  featureKey,
  state,
  depOptions,
  currentDeps,
}: {
  featureKey: string
  state: string
  depOptions: { key: string; label: string }[]
  currentDeps: string[]
}) {
  const stateAction = useCrudAction(setFeatureState)
  const del = useCrudAction(deleteFeature)
  const addDep = useCrudAction(addDependency)
  const rmDep = useCrudAction(removeDependency)

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <select
          defaultValue={state}
          disabled={stateAction.pending}
          onChange={(e) => {
            const d = new FormData()
            d.set('key', featureKey)
            d.set('default_state', e.target.value)
            stateAction.run(d)
          }}
          className="h-8 rounded-lg border border-line-strong px-2 text-xs focus:border-brand-500 focus:outline-none"
        >
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={del.pending}
          onClick={() => {
            const d = new FormData()
            d.set('key', featureKey)
            del.run(d)
          }}
          className="rounded-full border border-line-strong px-2.5 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
        >
          Delete
        </button>
      </span>
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        {currentDeps.map((d) => (
          <span key={d} className="flex items-center gap-1 rounded-full bg-paper-muted px-2 py-0.5 text-[11px] text-muted">
            {d}
            <button
              type="button"
              onClick={() => {
                const fd = new FormData()
                fd.set('feature_key', featureKey)
                fd.set('depends_on_key', d)
                rmDep.run(fd)
              }}
              className="font-semibold text-alert-deep hover:underline"
            >
              ✕
            </button>
          </span>
        ))}
        <select
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return
            const fd = new FormData()
            fd.set('feature_key', featureKey)
            fd.set('depends_on_key', e.target.value)
            addDep.run(fd)
            e.target.value = ''
          }}
          className="h-7 rounded-lg border border-line-strong px-2 text-[11px] focus:border-brand-500 focus:outline-none"
        >
          <option value="">+ depends on…</option>
          {depOptions
            .filter((o) => o.key !== featureKey && !currentDeps.includes(o.key))
            .map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
        </select>
      </span>
      {(stateAction.error || del.error || addDep.error || rmDep.error) && (
        <span className="text-xs text-alert-deep">
          {stateAction.error ?? del.error ?? addDep.error ?? rmDep.error}
        </span>
      )}
    </div>
  )
}
