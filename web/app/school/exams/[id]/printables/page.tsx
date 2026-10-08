import { Pager, paginate, pageSizeFrom } from '@/components/pager'
import Link from 'next/link'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { enrolledStudentIds, enrolledIdFilter } from '@/lib/school/offering-roster'
import { resolveBackHref, selfOrigin, withOrigin } from '@/lib/back-nav'
import { PrintTrigger } from '@/components/print/print-trigger'

// Roster picker for the single-student printables (issue #33, PRD §5.5) —
// the mockups' own entry point (a "Result Book" list) is out of scope here
// (split into issue #48's batch print-all); this is the minimal per-exam
// roster this ticket needs so Mark Sheet / Progress Report are actually
// reachable without it.

export default async function ExamPrintablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string | string[]; page?: string; size?: string }>
}) {
  const { id } = await params
  const { from, page, size } = await searchParams
  const pagerParams = { from: Array.isArray(from) ? from[0] : from, size }
  const pageSize = pageSizeFrom(size, 20)
  const backHref = resolveBackHref(from, `/school/exams/${id}`)
  // Links from here go a level deeper, so they carry *this* page's
  // address — origin included — otherwise Back from the leaf lands here
  // and the next Back falls through to Basic Info (map #373).
  const deeper = selfOrigin(`/school/exams/${id}/printables`, from)
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
      title={`${t('printables.title', lang)} — ${examLabel}`}
      crumbs={schoolCrumbs('/school/exams', lang, { label: t('exams.title', lang), href: '/school/exams' }, { label: `${t('printables.title', lang)} — ${examLabel}` })}
      backHref={backHref}
      backLabel={t('common.back', lang)}
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

  // Roster via the current Enrollment's Class Offering, not class_name/section
  // text — since #593 that pair can match two Offerings (issue #596).
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

  const rowsPage = paginate(students, page, pageSize)

  return (
    <div>
      {header}
      <section className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-paper-muted">
            <tr className="text-left text-sm text-muted">
              <th className="px-4 py-3 font-semibold">{t('students.roll', lang)}</th>
              <th className="px-4 py-3 font-semibold">{t('students.name', lang)}</th>
              <th className="px-4 py-3 font-semibold">{t('markSheet.docWord', lang)}</th>
              <th className="px-4 py-3 font-semibold">{t('progressReport.docWord', lang)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rowsPage.items.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">{s.roll_number ?? '—'}</td>
                <td className="px-4 py-3">{s.full_name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link href={withOrigin(`/school/exams/${exam.id}/mark-sheet/${s.id}`, deeper)} className="text-brand-600 hover:underline">
                      {t('markSheet.docWord', lang)}
                    </Link>
                    <PrintTrigger
                      iconOnly
                      href={`/school/exams/${exam.id}/mark-sheet/${s.id}/print`}
                      label={`${t('print.print', lang)} ${t('markSheet.docWord', lang)}: ${s.full_name}`}
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link
                      href={withOrigin(`/school/exams/${exam.id}/progress-report/${s.id}`, deeper)}
                      className="text-brand-600 hover:underline"
                    >
                      {t('progressReport.docWord', lang)}
                    </Link>
                    <PrintTrigger
                      iconOnly
                      href={`/school/exams/${exam.id}/progress-report/${s.id}/print`}
                      label={`${t('print.print', lang)} ${t('progressReport.docWord', lang)}: ${s.full_name}`}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager page={rowsPage.page} totalPages={rowsPage.totalPages} total={rowsPage.total} lang={lang} params={{ ...pagerParams, page }} pageSize={pageSize} />
      </section>
    </div>
  )
}
