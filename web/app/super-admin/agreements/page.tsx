import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { canDeleteVersion } from '@/lib/partner/agreements'
import { PageHeader, SectionCard, KpiCard } from '@/components/super-admin/dashboard-ui'
import { AddVersionForm, AgreementVersionRow, RecordAcceptanceForm } from './agreement-forms'

type Acceptance = { agreement_version: number; accepted_at: string; profiles: { full_name?: string | null } | null }

// Distributor agreements admin (#288), master-detail (map #409, #417): versions
// list (left) + the selected version's body/acceptances (right), ?selected=vN.
export default async function AgreementsPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string }>
}) {
  const { selected } = await searchParams
  const { supabase } = await getSuperAdminContext()

  const [{ data: versions }, { data: acceptances }, { data: distributors }] = await Promise.all([
    supabase.from('agreement_versions').select('version, body, effective_from').order('version', { ascending: false }),
    supabase
      .from('distributor_agreement_acceptances')
      .select('agreement_version, accepted_at, profiles(full_name)')
      .order('accepted_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('role', 'distributor').order('full_name'),
  ])

  const versionRows = versions ?? []
  const acceptanceRows = (acceptances ?? []) as Acceptance[]
  const acceptedVersions = acceptanceRows.map((a) => a.agreement_version)
  const countByVersion = new Map<number, number>()
  for (const v of acceptedVersions) countByVersion.set(v, (countByVersion.get(v) ?? 0) + 1)

  const selectedVersion = Number(selected) || versionRows[0]?.version || null
  const selectedVer = versionRows.find((v) => v.version === selectedVersion) ?? null
  const acceptancesForSelected = acceptanceRows.filter((a) => a.agreement_version === selectedVersion)

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Distributor Agreements"
        actions={
          <Link href="/super-admin" className="text-sm font-semibold text-brand-600 hover:underline">
            ← Dashboard
          </Link>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Versions" value={versionRows.length} tone="brand" />
        <KpiCard label="Acceptances" value={acceptanceRows.length} tone="green" />
        <KpiCard label="Latest version" value={versionRows[0] ? `v${versionRows[0].version}` : '—'} tone="amber" />
        <KpiCard label="Distributors" value={distributors?.length ?? 0} tone="rose" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
        {/* Left: publish + version list + record acceptance */}
        <div className="flex flex-col gap-4">
          <SectionCard title="Publish a new version">
            <AddVersionForm />
          </SectionCard>

          <SectionCard title="Versions" bodyClassName="p-2 sm:p-3">
            {versionRows.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {versionRows.map((v) => {
                  const active = v.version === selectedVersion
                  return (
                    <li key={v.version}>
                      <Link
                        href={`?selected=${v.version}`}
                        aria-current={active}
                        className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition ${
                          active ? 'bg-brand-50 ring-1 ring-brand-500' : 'hover:bg-paper-muted'
                        }`}
                      >
                        <span className="font-semibold text-ink">v{v.version}</span>
                        <span className="text-xs text-muted">
                          {new Date(v.effective_from).toLocaleDateString('en-GB')} · {countByVersion.get(v.version) ?? 0} accepted
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-2 py-6 text-center text-sm text-muted">No versions yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Record a distributor's acceptance">
            <p className="mb-3 text-xs text-muted">
              For agreements signed offline — logs the same legal record a self-service acceptance would.
            </p>
            <RecordAcceptanceForm
              distributors={(distributors ?? []).map((d) => ({ id: d.id, name: d.full_name ?? d.id.slice(0, 8) }))}
              versions={versionRows.map((v) => v.version)}
            />
          </SectionCard>
        </div>

        {/* Right: selected version body + its acceptances */}
        <div className="flex flex-col gap-4">
          {selectedVer ? (
            <>
              <ul>
                <AgreementVersionRow
                  version={selectedVer.version}
                  body={selectedVer.body}
                  effectiveFrom={selectedVer.effective_from}
                  acceptedCount={countByVersion.get(selectedVer.version) ?? 0}
                  deletable={canDeleteVersion(selectedVer.version, acceptedVersions)}
                />
              </ul>
              <SectionCard title={`Acceptances · v${selectedVer.version}`}>
                {acceptancesForSelected.length > 0 ? (
                  <ul className="divide-y divide-line">
                    {acceptancesForSelected.map((a, i) => (
                      <li key={i} className="flex items-center justify-between py-2 text-sm">
                        <span className="font-medium text-ink">{a.profiles?.full_name ?? 'Distributor'}</span>
                        <span className="text-muted">{new Date(a.accepted_at).toLocaleDateString('en-GB')}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-muted">No acceptances for this version yet.</p>
                )}
              </SectionCard>
            </>
          ) : (
            <SectionCard>
              <p className="py-12 text-center text-sm text-muted">Publish a version to begin.</p>
            </SectionCard>
          )}
        </div>
      </div>
    </main>
  )
}
