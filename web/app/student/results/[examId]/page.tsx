import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { loadGradingScheme } from '@/lib/grading-scheme-loader'
import { groupByExam, evaluateExam, type ResultRow } from '@/lib/student/results'
import { PrintTrigger } from '@/components/print/print-trigger'

// One published exam's result (#449).
//
// Grading is not recomputed here — lib/grading.ts is the authority and is
// unit-tested. Rank comes from student_exam_rank (0143), a definer function
// returning only the caller's own position, because computing it needs every
// student's totals and a Student must not be able to read those.
export default async function StudentResultPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = await params
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const { data } = await supabase.from('student_exam_result').select('*').eq('exam_id', examId)
  const [exam] = groupByExam((data ?? []) as ResultRow[])
  if (!exam) notFound()

  const scheme = exam.gradingSchemeId
    ? await loadGradingScheme(supabase, exam.gradingSchemeId)
    : null
  const { data: rankRows } = await supabase.rpc('student_exam_rank', { p_exam: examId })
  const rank = (rankRows as { rank: number; out_of: number }[] | null)?.[0] ?? null

  const evaluated = scheme ? evaluateExam(exam, scheme) : null

  return (
    <main className="w-full max-w-3xl p-6">
      <Link href="/student/results" className="text-sm text-brand-600 hover:underline">
        ← {t('student.resultsTitle', lang)}
      </Link>

      <div className="mt-3 mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">
          {exam.examName} <span className="text-base text-muted">{exam.examYear}</span>
        </h1>
        <PrintTrigger
          href={`/student/results/${examId}/print`}
          label={t('student.printMarkSheet', lang)}
        />
      </div>

      {evaluated && (
        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-line bg-paper p-4">
            <div className="text-xl font-extrabold text-brand-700">
              {evaluated.overall.gpa ?? '—'}
            </div>
            <div className="text-xs text-muted">{t('student.gpa', lang)}</div>
          </div>
          <div className="rounded-lg border border-line bg-paper p-4">
            <div className="text-xl font-extrabold">{evaluated.overall.label ?? '—'}</div>
            <div className="text-xs text-muted">{t('student.grade', lang)}</div>
          </div>
          <div className="rounded-lg border border-line bg-paper p-4">
            <div
              className={`text-xl font-extrabold ${evaluated.overall.passed ? 'text-mint-deep' : 'text-alert-deep'}`}
            >
              {t(evaluated.overall.passed ? 'student.passed' : 'student.failed', lang)}
            </div>
          </div>
          {rank && (
            <div className="rounded-lg border border-line bg-paper p-4">
              <div className="text-xl font-extrabold">
                {rank.rank}
                <span className="text-sm text-muted"> / {rank.out_of}</span>
              </div>
              <div className="text-xs text-muted">{t('student.rank', lang)}</div>
            </div>
          )}
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line-strong">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                {t('student.subject', lang)}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                {t('student.marks', lang)}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                {t('student.grade', lang)}
              </th>
            </tr>
          </thead>
          <tbody>
            {(evaluated?.subjects ?? []).map((s) => (
              <tr key={s.subjectId} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-sm font-medium">{s.subjectName}</td>
                <td className="px-3 py-2 text-sm">
                  {s.obtainedMarks} <span className="text-muted">/ {s.fullMarks}</span>
                </td>
                <td className="px-3 py-2 text-sm">
                  {s.label ?? '—'}
                  {s.gradePoint !== null && <span className="ml-1 text-xs text-muted">({s.gradePoint})</span>}
                </td>
              </tr>
            ))}
            {!evaluated && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-sm text-muted">
                  {t('student.noResults', lang)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
