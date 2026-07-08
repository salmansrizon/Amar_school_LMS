import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buildTree, LOCATION_LABEL, type LocationRow } from '@/lib/locations'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddLocationForm, DeleteLocationButton, AddClusterForm, DeleteClusterButton } from './tree-controls'
import type { LocationNode } from '@/lib/locations'
import type { Lang } from '@/lib/i18n'

function TreeNode({ node, lang }: { node: LocationNode; lang: Lang }) {
  return (
    <li>
      <div className="flex flex-wrap items-center gap-2 py-1.5">
        <span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
          {LOCATION_LABEL[node.type][lang]}
        </span>
        <span className="text-sm font-medium">{node.name}</span>
        <AddLocationForm parent={node} lang={lang} />
        <DeleteLocationButton id={node.id} lang={lang} />
      </div>
      {node.children.length > 0 && (
        <ul className="ml-5 border-l border-line pl-4">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} lang={lang} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default async function LocationsPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'super_admin') redirect('/super-admin')

  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, type, parent_id')
    .order('name')
  const { data: clusters } = await supabase
    .from('clusters')
    .select('id, name, locations(name)')
    .order('name')

  const tree = buildTree((locations ?? []) as LocationRow[])

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('locations.title', lang)}</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← {t('home.superAdmin', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{t('locations.tree', lang)}</h2>
          <AddLocationForm parent={null} lang={lang} />
        </div>
        {tree.length === 0 && <p className="text-sm text-muted">{t('locations.empty', lang)}</p>}
        <ul>
          {tree.map((node) => (
            <TreeNode key={node.id} node={node} lang={lang} />
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('locations.clusters', lang)}</h2>
        <AddClusterForm locations={(locations ?? []) as LocationRow[]} lang={lang} />
        <ul className="mt-3 divide-y divide-line">
          {clusters?.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="flex items-center gap-2 text-muted">
                {(c.locations as unknown as { name: string } | null)?.name}
                <DeleteClusterButton id={c.id} lang={lang} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
