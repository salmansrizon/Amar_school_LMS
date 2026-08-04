import Link from 'next/link'
import { notFound } from 'next/navigation'
import { type LocationRow } from '@/lib/locations'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { AddAssignmentForm } from './assignment-controls'
import { AssignmentList, type AssignmentRow } from './assignment-list'

export default async function PartnerAssignmentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  // Distributors only — Government Officials are managed on their own surface (#164).
  const { data: partner } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', id)
    .eq('role', 'distributor')
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
          isDistributor={partner.role === 'distributor'}
          locations={(locations ?? []) as LocationRow[]}
          schools={schools ?? []}
          lang={lang}
        />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <AssignmentList assignments={(assignments ?? []) as AssignmentRow[]} assigneeId={partner.id} lang={lang} />
      </section>
    </main>
  )
}
