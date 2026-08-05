import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import {
  PricingForm,
  AddPlanForm,
  DeletePlanButton,
  PlanFeatureToggle,
} from './subscription-forms'

type Labelled = { key: string; label?: { en?: string; bn?: string } | null }

// Subscription plans + pricing CRUD (#294, over #271 viewer). Edit platform
// pricing, create/delete plans, and toggle each plan's feature bundle.
export default async function SubscriptionConfigPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: plans }, { data: pricing }, { data: planFeatures }, { data: features }] =
    await Promise.all([
      supabase.from('subscription_plans').select('key, label, is_default').order('key'),
      supabase.from('subscription_pricing').select('base_fee, per_student_fee').maybeSingle(),
      supabase.from('plan_features').select('plan_key, feature_key'),
      supabase.from('features').select('key, label').order('key'),
    ])

  const granted = new Set((planFeatures ?? []).map((pf) => `${pf.plan_key}::${pf.feature_key}`))
  const label = (x: Labelled) => x.label?.en ?? x.key

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Subscription Config</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Platform Pricing</h2>
        <PricingForm
          baseTaka={pricing ? (pricing.base_fee / 100).toString() : ''}
          perStudentTaka={pricing ? (pricing.per_student_fee / 100).toString() : ''}
        />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Add a plan</h2>
        <AddPlanForm />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Plans</h2>
        <ul className="space-y-2">
          {plans?.map((p) => (
            <li key={p.key} className="flex items-center justify-between rounded-lg border border-line p-3">
              <span className="flex items-center gap-2">
                <span className="font-semibold">{label(p as Labelled)}</span>
                <span className="font-mono text-xs text-muted">{p.key}</span>
                {p.is_default && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">default</span>
                )}
              </span>
              <DeletePlanButton planKey={p.key} />
            </li>
          ))}
          {!plans?.length && <li className="text-sm text-muted">No plans yet.</li>}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Plan features</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Feature</th>
                {plans?.map((p) => (
                  <th key={p.key} className="px-3 py-2 text-center whitespace-nowrap">
                    {label(p as Labelled)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {features?.map((f) => (
                <tr key={f.key}>
                  <td className="py-1.5 pr-4">
                    <div className="font-medium">{label(f as Labelled)}</div>
                    <div className="font-mono text-xs text-muted">{f.key}</div>
                  </td>
                  {plans?.map((p) => (
                    <td key={p.key} className="px-3 py-1.5 text-center">
                      <div className="flex justify-center">
                        <PlanFeatureToggle
                          planKey={p.key}
                          featureKey={f.key}
                          granted={granted.has(`${p.key}::${f.key}`)}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              {!features?.length && (
                <tr>
                  <td className="py-6 text-center text-muted" colSpan={(plans?.length ?? 0) + 1}>
                    No features defined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
