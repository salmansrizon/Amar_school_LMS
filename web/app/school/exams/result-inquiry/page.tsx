import Form from 'next/form'
import { schoolCrumbs } from '@/lib/school-crumbs'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { ExamsTabs } from '../exams-tabs'
import { getSchoolContext } from '@/lib/school/context'
import { classSectionLabel } from '@/lib/students'
import { loadExamRosterResults } from '@/lib/exam-print-data'
import { Pill } from '@/components/data-table/data-table'
import { ComboboxField } from '@/components/ui/combobox-field'
import { railClass, PageHeader } from '@/components/ui/page'
import { pageTitle } from '@/lib/page-title'

// Result Inquiry (issue #48, PRD §5.5), per ui/school-owner/result-inquiry.html
// — plain GET-form search (mirrors ledger/page.tsx's date-range filter, no
// client component needed). The mockup shows a separate "Class" select
// alongside "Exam", but an exam already implies exactly one class
// (exams.class_id is a single FK) — so Exam is the only class-scoping input
// here; the results table's own Class column shows what that exam resolves
// to, matching the mockup's displayed column without a redundant control.
// "Subject" narrows results to students with an actual entered mark for that
// subject (an exam_marks row) — every class subject is otherwise evaluated
// for every roster student (0 when unmarked, grading.ts), so subject can't
// mean "students not taking X" the way it might on a school with subject-
// level opt-out; this is the closest real, queryable meaning.

export const generateMetadata = pageTitle('resultInquiry.title')

export default async function ResultInquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; subject?: string; roll?: string }>
}) {
  const { exam: examParam, subject: subjectParam = '', roll: rollParam = '' } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: exams } = await supabase
    .from('exams')
    .select('id, name, exam_year, class_id')
    .not('class_id', 'is', null)
    .order('created_at', { ascending: false })
  const examId = examParam || exams?.[0]?.id || ''

  const header = (
    <>
      <PageHeader
        title={`${t('resultInquiry.title', lang)}`}
        crumbs={schoolCrumbs('/school/exams', lang, { label: t('exams.title', lang), href: '/school/exams' }, { label: `${t('resultInquiry.title', lang)}` })}
      />
      <ExamsTabs active="/school/exams/result-inquiry" lang={lang} />
    </>
  )

  if (!exams?.length) {
    return (
      <div>
        {header}
        <p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">{t('exams.none', lang)}</p>
      </div>
    )
  }

  const roster = await loadExamRosterResults(supabase, examId)

  const form = (
    <Form className="card mb-4 grid gap-3 rounded-2xl border border-line bg-paper p-card sm:grid-cols-4" action="/school/exams/result-inquiry">
      <div>
        <label htmlFor="result_inquiry_exam" className="mb-1 block text-xs font-semibold text-muted">{t('resultInquiry.exam', lang)}</label>
        <ComboboxField
          id="result_inquiry_exam"
          name="exam"
          defaultValue={examId}
          options={exams.map((e) => ({ value: e.id, label: `${e.name} ${e.exam_year}` }))}
        />
      </div>
      <div>
        <label htmlFor="result_inquiry_subject" className="mb-1 block text-xs font-semibold text-muted">{t('resultInquiry.subject', lang)}</label>
        <ComboboxField
          id="result_inquiry_subject"
          name="subject"
          defaultValue={subjectParam}
          options={[
            { value: '', label: t('resultInquiry.allSubjects', lang) },
            ...(roster?.subjects ?? []).map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('resultInquiry.roll', lang)}</label>
        <input
          name="roll"
          type="text"
          inputMode="numeric"
          defaultValue={rollParam}
          placeholder={t('resultInquiry.rollPlaceholder', lang)}
          className="h-9 w-full rounded-md border border-line px-2 text-sm"
        />
      </div>
      <div className="flex items-end">
        <button type="submit" className="h-9 w-full cursor-pointer rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
          {t('resultInquiry.search', lang)}
        </button>
      </div>
    </Form>
  )

  if (!roster) {
    return (
      <div>
        {header}
        {form}
      </div>
    )
  }
  if (!roster.exam.class_id || !roster.scheme || !roster.rows.length) {
    const message = !roster.exam.class_id
      ? t('markEntry.noClassSet', lang)
      : !roster.scheme
        ? t('promotion.noScheme', lang)
        : t('markEntry.noStudents', lang)
    return (
      <div>
        {header}
        {form}
        <p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">{message}</p>
      </div>
    )
  }

  let subjectStudentIds: Set<string> | null = null
  if (subjectParam) {
    const { data: marks } = await supabase
      .from('exam_marks')
      .select('student_id')
      .eq('exam_id', examId)
      .eq('subject_id', subjectParam)
      .range(0, 4999)
    subjectStudentIds = new Set((marks ?? []).map((m) => m.student_id))
  }

  const rollQuery = rollParam.trim()
  const rows = roster.rows.filter((r) => {
    if (rollQuery && String(r.rollNumber ?? '') !== rollQuery) return false
    if (subjectStudentIds && !subjectStudentIds.has(r.studentId)) return false
    return true
  })

  const clsLabel = classSectionLabel(roster.cls?.name, roster.cls?.section) ?? '—'

  return (
    <div>
      {header}
      {form}
      <section className="overflow-x-auto rounded-2xl border border-line bg-paper">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-sm">
              <thead className="bg-paper-muted">
                <tr className="text-left text-sm text-muted">
                  <th className="px-4 py-3 font-semibold">{t('students.roll', lang)}</th>
                  <th className="px-4 py-3 font-semibold">{t('students.name', lang)}</th>
                  <th className="px-4 py-3 font-semibold">{t('exams.class', lang)}</th>
                  <th className="px-4 py-3 font-semibold">{t('resultBook.totalMarks', lang)}</th>
                  <th className="px-4 py-3 font-semibold">{t('markSheet.gpa', lang)}</th>
                  <th className="px-4 py-3 font-semibold">{t('promotion.result', lang)}</th>
                  <th className="px-4 py-3 font-semibold">{t('resultBook.actions', lang)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => {
                  const passed = row.overall?.passed ?? false
                  // Same reading as the Result Book: missing marks are an
                  // incomplete result, not a failed one.
                  const incomplete = row.marksMissing > 0
                  const noMarks = row.marksMissing === row.subjectResults.length
                  return (
                    <tr key={row.studentId}>
                      <td className={`px-4 py-3 ${railClass(incomplete ? undefined : passed ? 'mint' : 'alert')}`}>{row.rollNumber ?? '—'}</td>
                      <td className="px-4 py-3 font-medium">{row.fullName}</td>
                      <td className="px-4 py-3">{clsLabel}</td>
                      <td className="px-4 py-3">
                        {noMarks ? '—' : `${row.totalObtained} / ${row.totalFull}`}
                      </td>
                      <td className="px-4 py-3">{!incomplete && row.overall?.gpa !== null && row.overall?.gpa !== undefined ? row.overall.gpa.toFixed(2) : '—'}</td>
                      <td className="px-4 py-3">
                        {incomplete ? (
                          <Pill tone="sun">{t(noMarks ? 'exams.marksNotEntered' : 'exams.incomplete', lang)}</Pill>
                        ) : (
                          <Pill tone={passed ? 'mint' : 'alert'}>{passed ? t('promotion.pass', lang) : t('promotion.fail', lang)}</Pill>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/school/exams/${examId}/mark-sheet/${row.studentId}`} className="text-brand-600 hover:underline">
                          {t('markSheet.docWord', lang)}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('resultInquiry.noMatches', lang)}</p>
        )}
      </section>
    </div>
  )
}
