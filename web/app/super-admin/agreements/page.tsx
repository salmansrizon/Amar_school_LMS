import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { canDeleteVersion } from '@/lib/partner/agreements'
import { AddVersionForm, DeleteVersionButton } from './agreement-forms'

// Distributor agreements admin (#288). Version the legal agreement (create/delete)
// and see who accepted what. Delete is blocked once a version is accepted.
export default async function AgreementsPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: versions }, { data: acceptances }] = await Promise.all([
    supabase.from('agreement_versions').select('version, body, effective_from').order('version', { ascending: false }),
    supabase
      .from('distributor_agreement_acceptances')
      .select('agreement_version, accepted_at, profiles(full_name)')
      .order('accepted_at', { ascending: false }),
  ])

  const acceptedVersions = (acceptances ?? []).map((a) => a.agreement_version)
  const countByVersion = new Map<number, number>()
  for (const v of acceptedVersions) countByVersion.set(v, (countByVersion.get(v) ?? 0) + 1)

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Distributor Agreements</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Publish a new version</h2>
        <AddVersionForm />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Versions</h2>
        <ul className="space-y-3">
          {versions?.map((v) => (
            <li key={v.version} className="rounded-lg border border-line p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">
                  v{v.version}
                  <span className="ml-2 text-xs font-normal text-muted">
                    from {new Date(v.effective_from).toLocaleDateString('en-GB')} ·{' '}
                    {countByVersion.get(v.version) ?? 0} accepted
                  </span>
                </span>
                <DeleteVersionButton version={v.version} deletable={canDeleteVersion(v.version, acceptedVersions)} />
              </div>
              <p className="max-w-prose whitespace-pre-wrap text-sm text-muted">{v.body}</p>
            </li>
          ))}
          {!versions?.length && <li className="text-sm text-muted">No versions yet.</li>}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Recent acceptances</h2>
        <ul className="divide-y divide-line">
          {(acceptances as { agreement_version: number; accepted_at: string; profiles: { full_name?: string | null } | null }[] | null)?.map(
            (a, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{a.profiles?.full_name ?? 'Distributor'}</span>
                <span className="text-muted">
                  v{a.agreement_version} · {new Date(a.accepted_at).toLocaleDateString('en-GB')}
                </span>
              </li>
            ),
          )}
          {!acceptances?.length && <li className="py-2 text-sm text-muted">No acceptances yet.</li>}
        </ul>
      </section>
    </main>
  )
}
