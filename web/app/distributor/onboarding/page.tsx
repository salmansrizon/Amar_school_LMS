import Link from 'next/link'
import { getDistributorContext } from '@/lib/distributor/context'
import { latestVersion } from '@/lib/partner/agreements'
import { AcceptAgreement } from './accept-agreement'

// Onboarding tracker (#271). Won leads become schools to onboard; the open
// partner-tasks act as the onboarding checklist. All RLS-scoped to the caller.
// Also the distributor's agreement accept surface (#288).
export default async function OnboardingPage() {
  const { supabase, userId } = await getDistributorContext()

  const [{ data: agreement }, { data: wonLeads }, { data: tasks }, { data: versions }, { data: accepted }] =
    await Promise.all([
      supabase.from('distributor_profiles').select('agreement_status, status').maybeSingle(),
      supabase.from('leads').select('id, school_name, updated_at').eq('stage', 'won').order('updated_at', { ascending: false }),
      supabase.from('partner_tasks').select('id, title, status, due_at').order('due_at', { ascending: true }),
      supabase.from('agreement_versions').select('version, body'),
      supabase.from('distributor_agreement_acceptances').select('agreement_version').eq('distributor_id', userId),
    ])

  const openTasks = (tasks ?? []).filter((t) => t.status === 'open')
  const current = latestVersion(versions ?? [])
  const currentBody = (versions ?? []).find((v) => v.version === current)?.body ?? ''
  const acceptedCurrent = current != null && (accepted ?? []).some((a) => a.agreement_version === current)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <h1 className="mb-4 text-2xl font-extrabold">Onboarding</h1>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Your standing</h2>
        <div className="flex gap-3 text-sm">
          <span className="rounded-full bg-paper-muted px-3 py-1 font-semibold">
            Agreement: {agreement?.agreement_status ?? 'pending'}
          </span>
          <span className="rounded-full bg-paper-muted px-3 py-1 font-semibold">
            Account: {agreement?.status ?? 'pending'}
          </span>
        </div>
      </section>

      {current != null && (
        <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
          <h2 className="mb-3 font-bold">Agreement</h2>
          {acceptedCurrent ? (
            <p className="text-sm text-emerald-700">✓ You have accepted the current agreement (v{current}).</p>
          ) : (
            <AcceptAgreement version={current} body={currentBody} />
          )}
        </section>
      )}

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Schools to onboard ({wonLeads?.length ?? 0})</h2>
        <ul className="divide-y divide-line">
          {wonLeads?.map((l) => (
            <li key={l.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">{l.school_name}</span>
              <Link href={`/distributor/crm/${l.id}`} className="text-xs text-brand-600 hover:underline">
                view
              </Link>
            </li>
          ))}
          {!wonLeads?.length && <li className="py-2 text-sm text-muted">No won leads yet.</li>}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Open tasks ({openTasks.length})</h2>
        <ul className="divide-y divide-line">
          {openTasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">{t.title}</span>
              {t.due_at && (
                <span className="text-xs text-muted">
                  due {new Date(t.due_at).toLocaleDateString('en-GB')}
                </span>
              )}
            </li>
          ))}
          {!openTasks.length && <li className="py-2 text-sm text-muted">No open tasks.</li>}
        </ul>
      </section>
    </main>
  )
}
