import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { LOCATION_LABEL } from '@/lib/locations'
import { fetchAllLocations } from '@/lib/locations-server'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import {
  AssignDistributorForm,
  AssignSchoolForm,
  CreateClusterForm,
  RemoveSchoolButton,
  RenameClusterForm,
} from './cluster-controls'

// Clusters management (map #158, ticket #167) over the existing clusters table:
// list clusters with their school membership, create/rename, and assign schools.
// Under the Territory & Locations section. Distributor assignment (0119) added
// so a Cluster can be handed to one Distributor without over-reaching to
// sibling Clusters under the same Location (see 0119's own header comment).
export default async function ClustersPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const [{ data: clusters }, { data: schools }, locations, { data: distributors }, { data: assignments }] =
    await Promise.all([
      supabase.from('clusters').select('id, name, location_id, locations(name, type)').order('name'),
      supabase.from('schools').select('id, name, cluster_id').order('name'),
      fetchAllLocations(supabase),
      supabase.from('profiles').select('id, full_name').eq('role', 'distributor').order('full_name'),
      supabase
        .from('territory_assignments')
        .select('id, cluster_id, assignee_id, profiles(full_name)')
        .not('cluster_id', 'is', null),
    ])

  const membersByCluster = new Map<string, { id: string; name: string }[]>()
  const unassigned: { id: string; name: string }[] = []
  for (const s of schools ?? []) {
    if (s.cluster_id) {
      const list = membersByCluster.get(s.cluster_id) ?? []
      list.push({ id: s.id, name: s.name })
      membersByCluster.set(s.cluster_id, list)
    } else {
      unassigned.push({ id: s.id, name: s.name })
    }
  }

  const assignmentByCluster = new Map(
    (assignments as { id: string; cluster_id: string; assignee_id: string; profiles: { full_name: string | null } | null }[] | null ?? []).map(
      (a) => [a.cluster_id, { id: a.id, assigneeId: a.assignee_id, name: a.profiles?.full_name ?? 'Distributor' }],
    ),
  )

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sa.clusters.title', lang)}</h1>
        <Link href="/super-admin/locations" className="text-sm text-brand-600 hover:underline">
          ← {t('sa.nav.territory', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">{t('sa.clusters.create', lang)}</h2>
        <CreateClusterForm locations={locations} lang={lang} />
      </section>

      {!clusters?.length ? (
        <p className="text-sm text-muted">{t('sa.clusters.none', lang)}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {clusters.map((c) => {
            const loc = c.locations as unknown as { name: string; type: keyof typeof LOCATION_LABEL } | null
            const members = membersByCluster.get(c.id) ?? []
            return (
              <section key={c.id} className="rounded-lg border border-line bg-paper p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <RenameClusterForm clusterId={c.id} name={c.name} lang={lang} />
                  {loc && (
                    <span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
                      {LOCATION_LABEL[loc.type][lang]} — {loc.name}
                    </span>
                  )}
                </div>

                <div className="mb-3">
                  <span className="text-xs font-semibold text-muted">{t('sa.clusters.schools', lang)}</span>
                  {members.length === 0 ? (
                    <p className="text-sm text-muted">{t('sa.clusters.noSchools', lang)}</p>
                  ) : (
                    <ul className="divide-y divide-line text-sm">
                      {members.map((m) => (
                        <li key={m.id} className="flex items-center justify-between py-1.5">
                          <span>{m.name}</span>
                          <RemoveSchoolButton schoolId={m.id} lang={lang} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <AssignSchoolForm clusterId={c.id} unassigned={unassigned} lang={lang} />

                <div className="mt-3 border-t border-line pt-3">
                  <span className="mb-1 block text-xs font-semibold text-muted">
                    {t('sa.clusters.distributor', lang)}
                  </span>
                  <AssignDistributorForm
                    clusterId={c.id}
                    distributors={(distributors ?? []) as { id: string; full_name: string | null }[]}
                    current={assignmentByCluster.get(c.id) ?? null}
                    lang={lang}
                  />
                </div>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
