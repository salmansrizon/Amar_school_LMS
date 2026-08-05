import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { AddModuleForm, DeleteModuleButton, AddFeatureForm, FeatureRowActions } from './module-forms'

type Labelled = { key: string; label?: { en?: string; bn?: string } | null }

// Modules / features config CRUD (#293, over #271 viewer). Create/delete modules
// + features, set each feature's default state, and manage dependency edges.
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
  const depOptions = (features ?? []).map((f) => ({ key: f.key, label: label(f as Labelled) }))

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Modules &amp; Features</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Add a module</h2>
        <AddModuleForm />
      </section>

      <div className="space-y-4">
        {modules?.map((m) => (
          <section key={m.key} className="rounded-lg border border-line bg-paper p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold">
                {label(m as Labelled)} <span className="font-mono text-xs font-normal text-muted">{m.key}</span>
              </h2>
              <DeleteModuleButton moduleKey={m.key} />
            </div>
            <ul className="divide-y divide-line">
              {features
                ?.filter((f) => f.module_key === m.key)
                .map((f) => (
                  <li key={f.key} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div>
                      <div className="text-sm font-medium">{label(f as Labelled)}</div>
                      <div className="font-mono text-xs text-muted">{f.key}</div>
                    </div>
                    <FeatureRowActions
                      featureKey={f.key}
                      state={f.default_state}
                      depOptions={depOptions}
                      currentDeps={depsByFeature.get(f.key) ?? []}
                    />
                  </li>
                ))}
              {!features?.some((f) => f.module_key === m.key) && (
                <li className="py-2 text-sm text-muted">No features.</li>
              )}
            </ul>
            <AddFeatureForm moduleKey={m.key} />
          </section>
        ))}
        {!modules?.length && <p className="text-sm text-muted">No modules yet.</p>}
      </div>
    </main>
  )
}
