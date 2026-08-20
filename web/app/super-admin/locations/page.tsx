import Link from 'next/link'
import { buildTree, LOCATION_LABEL } from '@/lib/locations'
import { fetchAllLocations } from '@/lib/locations-server'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { PageHeader, SectionCard } from '@/components/super-admin/dashboard-ui'
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
  const { supabase } = await getSuperAdminContext()

  const locations = await fetchAllLocations(supabase)
  const { data: clusters } = await supabase
    .from('clusters')
    .select('id, name, locations(name)')
    .order('name')

  const tree = buildTree(locations)

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t('locations.title', lang)}
        actions={
          <Link href="/super-admin" className="text-sm font-semibold text-brand-600 hover:underline">
            ← {t('home.superAdmin', lang)}
          </Link>
        }
      />

      <section className="mt-6">
        <SectionCard title={t('locations.tree', lang)} action={<AddLocationForm parent={null} lang={lang} />}>
          {tree.length === 0 && <p className="text-sm text-muted">{t('locations.empty', lang)}</p>}
          <ul>
            {tree.map((node) => (
              <TreeNode key={node.id} node={node} lang={lang} />
            ))}
          </ul>
        </SectionCard>
      </section>

      <section className="mt-4">
        <SectionCard title={t('locations.clusters', lang)}>
          <AddClusterForm locations={locations} lang={lang} />
          <ul className="mt-3 divide-y divide-line/70">
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
        </SectionCard>
      </section>
    </main>
  )
}
