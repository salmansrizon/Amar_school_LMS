import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { formatTaka } from '@/lib/money'

type Labelled = { key: string; label?: { en?: string; bn?: string } | null }

// Subscription config viewer (#271 / billing 0088). Platform pricing + the
// feature bundle each plan grants.
export default async function SubscriptionConfigPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: plans }, { data: pricing }, { data: planFeatures }, { data: features }] =
    await Promise.all([
      supabase.from('subscription_plans').select('key, label, is_default').order('key'),
      supabase.from('subscription_pricing').select('base_fee, per_student_fee').maybeSingle(),
      supabase.from('plan_features').select('plan_key, feature_key'),
      supabase.from('features').select('key, label'),
    ])

  const featLabel = new Map((features ?? []).map((f) => [f.key, (f as Labelled).label?.en ?? f.key]))
  const byPlan = new Map<string, string[]>()
  for (const pf of planFeatures ?? []) {
    byPlan.set(pf.plan_key, [...(byPlan.get(pf.plan_key) ?? []), featLabel.get(pf.feature_key) ?? pf.feature_key])
  }
  const label = (p: Labelled) => p.label?.en ?? p.key

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Subscription Config</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Platform Pricing</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted">Base fee / month</dt>
            <dd className="text-lg font-bold">{formatTaka(pricing?.base_fee ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted">Per active student / month</dt>
            <dd className="text-lg font-bold">{formatTaka(pricing?.per_student_fee ?? 0)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Plans</h2>
        <ul className="space-y-3">
          {plans?.map((p) => (
            <li key={p.key} className="rounded-lg border border-line p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-semibold">{label(p as Labelled)}</span>
                {p.is_default && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                    default
                  </span>
                )}
              </div>
              <div className="text-xs text-muted">
                {byPlan.get(p.key)?.length ? byPlan.get(p.key)!.join(' · ') : 'No feature grants.'}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
