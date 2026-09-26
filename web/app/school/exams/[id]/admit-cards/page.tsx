import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { enrolledStudentIds, enrolledIdFilter } from '@/lib/school/offering-roster'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { resolveBackHref, selfOrigin, withOrigin } from '@/lib/back-nav'

// Admit card roster picker (issue #48, PRD §5.5) — same shape as printables/
// page.tsx's mark-sheet/progress-report roster, one entry point per student
// plus a link into the shared batch print-all page (../print-all) preset to
// the admit-card doc type.

export default async function AdmitCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string | string[] }>
}) {
  const { id } = await params
  const { from } = await searchParams
  const backHref = resolveBackHref(from, `/school/exams/${id}`)
  // Links from here go a level deeper, so they carry *this* page's
  // address — origin included — otherwise Back from the leaf lands here
  // and the next Back falls through to Basic Info (map #373).
  const deeper = selfOrigin(`/school/exams/${id}/admit-cards`, from)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, class_id')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const examLabel = `${exam.name} (${exam.exam_year})`

  const header = (
    <PageHeader
      title={`${t('admitCard.title', lang)} — ${examLabel}`}
      crumbs={schoolCrumbs('/school/exams', lang, { label: t('exams.title', lang), href: '/school/exams' }, { label: `${t('admitCard.title', lang)} — ${examLabel}` })}
      backHref={backHref}
      backLabel={t('common.back', lang)}
      actions={
        <Link
          href={withOrigin(`/school/exams/${exam.id}/print-all?doc=admit-card`, deeper)}
          className="inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('printAll.title', lang)}
        </Link>
      }
    />
  )

  if (!exam.class_id) {
    return (
      <div>
        {header}
        <p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">
          {t('markEntry.noClassSet', lang)}
        </p>
      </div>
    )
  }

  // Roster resolved through the current Enrollment's Class Offering, not a
  // class_name/section text match (issue #596 — since #593 two Offerings can
  // share that pair, and a text match would merge both shifts).
  const enrolledIds = await enrolledStudentIds(supabase, exam.class_id)
  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, roll_number')
    .in('id', enrolledIdFilter(enrolledIds))
    .is('archived_at', null)
    .order('roll_number', { ascending: true, nullsFirst: false })

  if (!students?.length) {
    return (
      <div>
        {header}
        <p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">
          {t('markEntry.noStudents', lang)}
        </p>
      </div>
    )
  }

  return (
    <div>
      {header}
      <section className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-paper-muted">
            <tr className="text-left text-sm text-muted">
              <th className="px-4 py-3 font-semibold">{t('students.roll', lang)}</th>
              <th className="px-4 py-3 font-semibold">{t('students.name', lang)}</th>
              <th className="px-4 py-3 font-semibold">{t('admitCard.docWord', lang)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {students.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">{s.roll_number ?? '—'}</td>
                <td className="px-4 py-3">{s.full_name}</td>
                <td className="px-4 py-3">
                  <Link href={withOrigin(`/school/exams/${exam.id}/admit-cards/${s.id}`, deeper)} className="text-brand-600 hover:underline">
                    {t('admitCard.docWord', lang)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
