import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { classShiftLabel } from '@/lib/students'
import { loadExamRosterResults } from '@/lib/exam-print-data'
import { Badge } from '@/components/print/pieces'

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

export default async function ResultInquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; subject?: string; roll?: string }>
}) {
  const { exam: examParam, subject: subjectParam = '', roll: rollParam = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: exams } = await supabase
    .from('exams')
    .select('id, name, exam_year, class_id')
    .not('class_id', 'is', null)
    .order('created_at', { ascending: false })
  const examId = examParam || exams?.[0]?.id || ''

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-extrabold">{t('resultInquiry.title', lang)}</h1>
      <Link href="/school/exams" className="text-sm text-brand-600 hover:underline">
        ← {t('exams.title', lang)}
      </Link>
    </div>
  )

  if (!exams?.length) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">{t('exams.none', lang)}</p>
      </main>
    )
  }

  const roster = await loadExamRosterResults(supabase, examId)

  const form = (
    <form method="get" className="card mb-4 grid gap-3 rounded-lg border border-line bg-paper p-5 shadow-card sm:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('resultInquiry.exam', lang)}</label>
        <select name="exam" defaultValue={examId} className="h-9 w-full rounded-md border border-line px-2 text-sm">
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} {e.exam_year}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('resultInquiry.subject', lang)}</label>
        <select name="subject" defaultValue={subjectParam} className="h-9 w-full rounded-md border border-line px-2 text-sm">
          <option value="">{t('resultInquiry.allSubjects', lang)}</option>
          {(roster?.subjects ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
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
    </form>
  )

  if (!roster) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        {header}
        {form}
      </main>
    )
  }
  if (!roster.exam.class_id || !roster.scheme || !roster.rows.length) {
    const message = !roster.exam.class_id
      ? t('markEntry.noClassSet', lang)
      : !roster.scheme
        ? t('promotion.noScheme', lang)
        : t('markEntry.noStudents', lang)
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        {header}
        {form}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">{message}</p>
      </main>
    )
  }

  let subjectStudentIds: Set<string> | null = null
  if (subjectParam) {
    const { data: marks } = await supabase
      .from('exam_marks')
      .select('student_id')
      .eq('exam_id', examId)
      .eq('subject_id', subjectParam)
    subjectStudentIds = new Set((marks ?? []).map((m) => m.student_id))
  }

  const rollQuery = rollParam.trim()
  const rows = roster.rows.filter((r) => {
    if (rollQuery && String(r.rollNumber ?? '') !== rollQuery) return false
    if (subjectStudentIds && !subjectStudentIds.has(r.studentId)) return false
    return true
  })

  const clsLabel = classShiftLabel(roster.cls?.name, roster.cls?.section) ?? '—'

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      {header}
      {form}
      <section className="rounded-lg border border-line bg-paper p-4 shadow-card">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2 font-semibold">{t('students.roll', lang)}</th>
                  <th className="py-2 pr-2 font-semibold">{t('students.name', lang)}</th>
                  <th className="py-2 pr-2 font-semibold">{t('exams.class', lang)}</th>
                  <th className="py-2 pr-2 font-semibold">{t('resultBook.totalMarks', lang)}</th>
                  <th className="py-2 pr-2 font-semibold">{t('markSheet.gpa', lang)}</th>
                  <th className="py-2 pr-2 font-semibold">{t('promotion.result', lang)}</th>
                  <th className="py-2 font-semibold">{t('resultBook.actions', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const passed = row.overall?.passed ?? false
                  return (
                    <tr key={row.studentId} className="border-b border-line">
                      <td className="py-2 pr-2">{row.rollNumber ?? '—'}</td>
                      <td className="py-2 pr-2 font-medium">{row.fullName}</td>
                      <td className="py-2 pr-2">{clsLabel}</td>
                      <td className="py-2 pr-2">
                        {row.totalObtained} / {row.totalFull}
                      </td>
                      <td className="py-2 pr-2">{row.overall?.gpa !== null && row.overall?.gpa !== undefined ? row.overall.gpa.toFixed(2) : '—'}</td>
                      <td className="py-2 pr-2">
                        <Badge tone={passed ? 'success' : 'alert'}>{passed ? t('promotion.pass', lang) : t('promotion.fail', lang)}</Badge>
                      </td>
                      <td className="py-2">
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
    </main>
  )
}
