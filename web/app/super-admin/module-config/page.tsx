import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'

type Labelled = { key: string; label?: { en?: string; bn?: string } | null }

// Module / feature config viewer (#271 / feature engine 0081). Shows the module
// tree, each feature's default state, and its dependency edges.
export default async function ModuleConfigPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: modules }, { data: features }, { data: deps }] = await Promise.all([
    supabase.from('modules').select('key, label, sort').order('sort'),
    supabase.from('features').select('key, module_key, label, default_state').order('key'),
    supabase.from('feature_dependencies').select('feature_key, depends_on_key'),
  ])

  const depsByFeature = new Map<string, string[]>()
  for (const d of deps ?? []) {
    depsByFeature.set(d.feature_key, [...(depsByFeature.get(d.feature_key) ?? []), d.depends_on_key])
  }
  const label = (x: Labelled) => x.label?.en ?? x.key

  const stateTone: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    disabled: 'bg-alert-soft text-alert-deep',
    trial: 'bg-amber-50 text-amber-700',
    premium: 'bg-brand-50 text-brand-700',
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Modules &amp; Features</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <div className="space-y-4">
        {modules?.map((m) => (
          <section key={m.key} className="rounded-lg border border-line bg-paper p-5 shadow-card">
            <h2 className="mb-3 font-bold">{label(m as Labelled)}</h2>
            <ul className="divide-y divide-line">
              {features
                ?.filter((f) => f.module_key === m.key)
                .map((f) => (
                  <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <div className="text-sm font-medium">{label(f as Labelled)}</div>
                      {depsByFeature.get(f.key)?.length ? (
                        <div className="text-xs text-muted">
                          depends on: {depsByFeature.get(f.key)!.join(', ')}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stateTone[f.default_state] ?? 'bg-paper-muted text-ink'}`}
                    >
                      {f.default_state}
                    </span>
                  </li>
                ))}
              {!features?.some((f) => f.module_key === m.key) && (
                <li className="py-2 text-sm text-muted">No features.</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
