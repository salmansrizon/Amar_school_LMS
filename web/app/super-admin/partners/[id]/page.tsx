import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { LOCATION_LABEL, type LocationRow } from '@/lib/locations'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddAssignmentForm, RemoveAssignmentButton } from './assignment-controls'

export default async function PartnerAssignmentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'super_admin') redirect('/super-admin')

  const { data: partner } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', id)
    .in('role', ['dealer', 'gov_official'])
    .single()
  if (!partner) notFound()

  const [{ data: assignments }, { data: locations }, { data: schools }] = await Promise.all([
    supabase
      .from('territory_assignments')
      .select('id, tier, locations(name, type), schools(name)')
      .eq('assignee_id', id)
      .order('created_at'),
    supabase.from('locations').select('id, name, type, parent_id').order('name'),
    supabase.from('schools').select('id, name').order('name'),
  ])

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">
          {t('partners.assignments', lang)} — {partner.full_name}
        </h1>
        <Link href="/super-admin/partners" className="text-sm text-brand-600 hover:underline">
          ← {t('partners.list', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <AddAssignmentForm
          assigneeId={partner.id}
          isDealer={partner.role === 'dealer'}
          locations={(locations ?? []) as LocationRow[]}
          schools={schools ?? []}
          lang={lang}
        />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {!assignments?.length && <p className="text-sm text-muted">{t('partners.none', lang)}</p>}
        <ul className="divide-y divide-line">
          {assignments?.map((a) => {
            const location = a.locations as unknown as { name: string; type: keyof typeof LOCATION_LABEL } | null
            const school = a.schools as unknown as { name: string } | null
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  {location && (
                    <>
                      <span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
                        {LOCATION_LABEL[location.type][lang]}
                      </span>
                      <span className="font-medium">{location.name}</span>
                    </>
                  )}
                  {school && (
                    <>
                      <span className="rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">
                        {t('territory.extended', lang)}
                      </span>
                      <span className="font-medium">{school.name}</span>
                    </>
                  )}
                  {a.tier && (
                    <span className="text-xs text-muted">
                      {t('partners.tier', lang)}: {a.tier}
                    </span>
                  )}
                </span>
                <RemoveAssignmentButton id={a.id} assigneeId={partner.id} label={t('partners.remove', lang)} />
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
