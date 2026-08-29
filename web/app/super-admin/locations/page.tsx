import Link from 'next/link'
import { buildTree, LOCATION_LABEL } from '@/lib/locations'
import { fetchAllLocations } from '@/lib/locations-server'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { PageHeader, SectionCard } from '@/components/super-admin/dashboard-ui'
import { AddLocationForm, DeleteLocationButton, AddClusterForm, DeleteClusterButton } from './tree-controls'
import type { LocationNode, LocationRow } from '@/lib/locations'
import type { Lang } from '@/lib/i18n'

// #550: the tree held 5,218 nodes and 5,911 controls in one page, fully
// expanded, and took 5.7s to settle. Bangladesh has four location levels and
// the seed fills all of them, so "render everything" was never going to scale
// with the country.
//
// A branch now renders its children only when it is open, and what is open
// lives in the URL rather than in client state: `?open=<id>,<id>`. That keeps
// this a server component, makes an expanded branch a shareable link, and
// survives a reload — three things a useState toggle would each have cost.
function toggleHref(openIds: Set<string>, id: string, q: string): string {
  const next = new Set(openIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  const params = new URLSearchParams()
  if (next.size) params.set('open', [...next].join(','))
  if (q) params.set('q', q)
  const query = params.toString()
  return `/super-admin/locations${query ? `?${query}` : ''}#loc-${id}`
}

function TreeNode({
  node,
  openIds,
  q,
  lang,
}: {
  node: LocationNode
  openIds: Set<string>
  q: string
  lang: Lang
}) {
  const open = openIds.has(node.id)
  const hasChildren = node.children.length > 0
  return (
    <li id={`loc-${node.id}`}>
      <div className="flex flex-wrap items-center gap-2 py-1.5">
        {hasChildren ? (
          <Link
            href={toggleHref(openIds, node.id, q)}
            aria-expanded={open}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-brand-600 hover:bg-brand-50"
          >
            {open ? '−' : '+'}
          </Link>
        ) : (
          <span className="inline-block size-6 shrink-0" aria-hidden="true" />
        )}
        <span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
          {LOCATION_LABEL[node.type][lang]}
        </span>
        <span className="text-sm font-medium">{node.name}</span>
        {hasChildren && (
          <span className="text-xs text-muted">{node.children.length}</span>
        )}
        <AddLocationForm parent={node} lang={lang} />
        <DeleteLocationButton id={node.id} lang={lang} />
      </div>
      {open && hasChildren && (
        <ul className="ml-5 border-l border-line pl-4">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} openIds={openIds} q={q} lang={lang} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** The chain of ancestors above a node, root first — what a search hit needs to
 *  be readable ("Barishal › Barguna › Amtali"). */
function ancestorPath(byId: Map<string, LocationRow>, row: LocationRow): LocationRow[] {
  const chain: LocationRow[] = []
  let current = row.parent_id ? byId.get(row.parent_id) : undefined
  while (current) {
    chain.unshift(current)
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }
  return chain
}

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; q?: string }>
}) {
  const { open = '', q = '' } = await searchParams
  const openIds = new Set(open.split(',').filter(Boolean))
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const locations = await fetchAllLocations(supabase)
  const { data: clusters } = await supabase
    .from('clusters')
    .select('id, name, locations(name)')
    .order('name')

  const tree = buildTree(locations)
  const byId = new Map(locations.map((l) => [l.id, l]))
  // Search is over the rows, not the rendered DOM: a collapsed tree has nothing
  // to Ctrl+F through, so it has to answer "where is Amtali" itself. Matching
  // is done on the fetched set — it is already in memory for the tree, and one
  // ilike round-trip per keystroke would be slower, not faster.
  const term = q.trim().toLowerCase()
  const matches = term
    ? locations.filter((l) => l.name.toLowerCase().includes(term)).slice(0, 50)
    : []

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
          <form className="mb-3 flex flex-wrap items-center gap-2" action="/super-admin/locations">
            <input
              name="q"
              defaultValue={q}
              placeholder={t('locations.searchPlaceholder', lang)}
              className="h-11 rounded-lg border border-line bg-paper px-3 text-sm sm:h-9"
            />
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted sm:h-9"
            >
              {t('classes.filter', lang)}
            </button>
            {q && (
              <Link href="/super-admin/locations" className="text-xs font-semibold text-brand-600 hover:underline">
                {t('locations.clearSearch', lang)}
              </Link>
            )}
            <span className="text-xs text-muted">
              {t('locations.total', lang)}: {locations.length}
            </span>
          </form>

          {q ? (
            <ul className="divide-y divide-line/70">
              {matches.length === 0 && <p className="text-sm text-muted">{t('locations.noMatch', lang)}</p>}
              {matches.map((row) => {
                const path = ancestorPath(byId, row)
                return (
                  <li key={row.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
                      {LOCATION_LABEL[row.type][lang]}
                    </span>
                    <span className="font-medium">{row.name}</span>
                    {path.length > 0 && (
                      <span className="text-xs text-muted">{path.map((p) => p.name).join(' › ')}</span>
                    )}
                    {/* Open the tree at this hit: every ancestor plus the node. */}
                    <Link
                      href={`/super-admin/locations?open=${[...path.map((p) => p.id), row.id].join(',')}#loc-${row.id}`}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {t('locations.showInTree', lang)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <>
              {tree.length === 0 && <p className="text-sm text-muted">{t('locations.empty', lang)}</p>}
              <ul>
                {tree.map((node) => (
                  <TreeNode key={node.id} node={node} openIds={openIds} q={q} lang={lang} />
                ))}
              </ul>
            </>
          )}
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
