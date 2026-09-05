import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { classSectionLabel } from '@/lib/students'
import { loadExamRosterResults } from '@/lib/exam-print-data'
import { Badge } from '@/components/print/pieces'
import { ExamPicker, type ExamOption } from './result-book-controls'
import { railClass } from '@/components/ui/page'
import { BackLink } from '@/components/back-link'
import { resolveBackHref, selfOrigin, withOrigin } from '@/lib/back-nav'

// Result Book (issue #48, PRD §5.5), per ui/school-owner/result-book.html —
// the whole-roster result table result-book/result-inquiry/batch-print all
// share (loadExamRosterResults, exam-print-data.ts). Position/GPA/Grade reuse
// grading.ts + exam-results.ts exactly as mark-sheet/promotion do; "Print
// All" hands off to the shared batch print-all page preset to mark-sheet.

/** Mirrors the mockup's low-but-passing grade getting a distinct "warning"
 * badge (its sample C-grade/GPA-2.00 row) instead of the plain pass/fail
 * success/alert split every other printable uses. */
function gradeTone(passed: boolean, gpa: number | null): 'success' | 'warning' | 'alert' {
  if (!passed) return 'alert'
  if (gpa !== null && gpa < 3) return 'warning'
  return 'success'
}

export default async function ResultBookPage({
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
  const deeper = selfOrigin(`/school/exams/${id}/result-book`, from)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ data: exams }, roster] = await Promise.all([
    supabase
      .from('exams')
      .select('id, name, exam_year, class_id')
      .not('class_id', 'is', null)
      .order('created_at', { ascending: false }),
    loadExamRosterResults(supabase, id),
  ])
  if (!roster) notFound()

  const classIds = [...new Set((exams ?? []).map((e) => e.class_id).filter((v): v is string => v !== null))]
  const { data: classRows } = classIds.length
    ? await supabase.from('class_offerings').select('id, name, section').in('id', classIds)
    : { data: [] as { id: string; name: string; section: string | null }[] }
  const classById = new Map((classRows ?? []).map((c) => [c.id, c]))

  const examOptions: ExamOption[] = (exams ?? []).map((e) => {
    const cls = e.class_id ? classById.get(e.class_id) : null
    const clsLabel = cls ? classSectionLabel(cls.name, cls.section) : null
    return { id: e.id, label: `${e.name} ${e.exam_year}${clsLabel ? ` - ${clsLabel}` : ''}` }
  })

  const examLabel = `${roster.exam.name} ${roster.exam.exam_year}`

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-extrabold">
        {t('resultBook.title', lang)} — {examLabel}
      </h1>
      <BackLink href={backHref} label={t('common.back', lang)} />
    </div>
  )

  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <ExamPicker examId={id} exams={examOptions} origin={deeper} lang={lang} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/school/exams/result-inquiry" className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted">
          {t('resultInquiry.title', lang)}
        </Link>
        <Link href={withOrigin(`/school/exams/${id}/promotion`, deeper)} className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted">
          {t('exams.promotion', lang)}
        </Link>
        <Link
          href={withOrigin(`/school/exams/${id}/print-all?doc=mark-sheet`, deeper)}
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('printAll.title', lang)}
        </Link>
      </div>
    </div>
  )

  if (!roster.exam.class_id) {
    return (
      <div>
        {header}
        {toolbar}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted">
          {t('markEntry.noClassSet', lang)}
        </p>
      </div>
    )
  }
  if (!roster.scheme) {
    return (
      <div>
        {header}
        {toolbar}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted">{t('promotion.noScheme', lang)}</p>
      </div>
    )
  }
  if (!roster.rows.length) {
    return (
      <div>
        {header}
        {toolbar}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted">{t('markEntry.noStudents', lang)}</p>
      </div>
    )
  }

  return (
    <div>
      {header}
      {toolbar}
      <section className="rounded-lg border border-line bg-paper p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-sm">
            <thead>
              <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-2 font-semibold">{t('promotion.position', lang)}</th>
                <th className="py-2 pr-2 font-semibold">{t('students.roll', lang)}</th>
                <th className="py-2 pr-2 font-semibold">{t('students.name', lang)}</th>
                <th className="py-2 pr-2 font-semibold">{t('resultBook.totalMarks', lang)}</th>
                <th className="py-2 pr-2 font-semibold">{t('markSheet.gpa', lang)}</th>
                <th className="py-2 pr-2 font-semibold">{t('markSheet.grade', lang)}</th>
                <th className="py-2 pr-2 font-semibold">{t('promotion.result', lang)}</th>
                <th className="py-2 font-semibold">{t('resultBook.actions', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {roster.rows.map((row) => {
                const passed = row.overall?.passed ?? false
                return (
                  <tr key={row.studentId} className="border-b border-line">
                    <td className={`py-2 pr-2 ${railClass(passed ? 'mint' : 'alert')}`}>{row.rankPosition ?? '—'}</td>
                    <td className="py-2 pr-2">{row.rollNumber ?? '—'}</td>
                    <td className="py-2 pr-2 font-medium">{row.fullName}</td>
                    <td className="py-2 pr-2">
                      {row.totalObtained} / {row.totalFull}
                    </td>
                    <td className="py-2 pr-2">{row.overall?.gpa !== null && row.overall?.gpa !== undefined ? row.overall.gpa.toFixed(2) : '—'}</td>
                    <td className="py-2 pr-2">
                      {row.overall?.label ? <Badge tone={gradeTone(passed, row.overall.gpa)}>{row.overall.label}</Badge> : '—'}
                    </td>
                    <td className="py-2 pr-2">
                      <Badge tone={passed ? 'success' : 'alert'}>{passed ? t('promotion.pass', lang) : t('promotion.fail', lang)}</Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Link href={withOrigin(`/school/exams/${id}/mark-sheet/${row.studentId}`, deeper)} className="text-brand-600 hover:underline">
                          {t('markSheet.docWord', lang)}
                        </Link>
                        <Link href={withOrigin(`/school/exams/${id}/progress-report/${row.studentId}`, deeper)} className="text-brand-600 hover:underline">
                          {t('progressReport.docWord', lang)}
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
