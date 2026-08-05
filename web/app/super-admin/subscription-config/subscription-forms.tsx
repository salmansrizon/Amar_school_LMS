'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { MatrixToggle } from '@/components/matrix-toggle'
import { setPricing, createPlan, deletePlan, setPlanFeature } from './actions'

const input = 'h-10 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'

export function PricingForm({ baseTaka, perStudentTaka }: { baseTaka: string; perStudentTaka: string }) {
  const { error, pending, onSubmit } = useCrudAction(setPricing)
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-semibold text-muted">Base fee / month (৳)</span>
        <input name="base_fee" defaultValue={baseTaka} className={input} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-semibold text-muted">Per student / month (৳)</span>
        <input name="per_student_fee" defaultValue={perStudentTaka} className={input} />
      </label>
      <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        Save pricing
      </button>
      {error && <p className="w-full text-sm text-alert-deep">{error}</p>}
    </form>
  )
}

export function AddPlanForm() {
  const { error, pending, onSubmit } = useCrudAction(createPlan, { resetOnSuccess: true })
  return (
    <form className="grid gap-2 sm:grid-cols-4" onSubmit={onSubmit}>
      <input name="key" required placeholder="plan_key" className={`${input} font-mono`} />
      <input name="label_en" placeholder="Label (EN)" className={input} />
      <input name="label_bn" placeholder="লেবেল (BN)" className={input} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_default" /> default
      </label>
      <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-4 sm:w-auto sm:justify-self-start">
        Add plan
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}

export function DeletePlanButton({ planKey }: { planKey: string }) {
  const { error, pending, run } = useCrudAction(deletePlan)
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const d = new FormData()
          d.set('key', planKey)
          run(d)
        }}
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        Delete
      </button>
    </span>
  )
}

export function PlanFeatureToggle({
  planKey,
  featureKey,
  granted,
}: {
  planKey: string
  featureKey: string
  granted: boolean
}) {
  return (
    <MatrixToggle
      on={granted}
      fields={{ plan_key: planKey, feature_key: featureKey }}
      action={setPlanFeature}
      ariaLabel={`${granted ? 'Remove' : 'Add'} ${featureKey} on ${planKey}`}
    />
  )
}
