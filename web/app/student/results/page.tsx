import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { groupByExam, type ResultRow } from '@/lib/student/results'
import { pageTitle } from '@/lib/student/metadata'

// Published exams only (#449). The gate is not in this query — it is in
// student_exam_result (0143), so no screen can forget it.
export const generateMetadata = pageTitle('student.resultsTitle')

export default async function StudentResultsPage() {
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const { data } = await supabase.from('student_exam_result').select('*')
  const exams = groupByExam((data ?? []) as ResultRow[])

  return (
    <main className="w-full max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-extrabold">{t('student.resultsTitle', lang)}</h1>

      {!exams.length ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noResults', lang)}
        </p>
      ) : (
        <ul className="space-y-3">
          {exams.map((exam) => (
            <li key={exam.examId}>
              <Link
                href={`/student/results/${exam.examId}`}
                className="block rounded-lg border border-line bg-paper p-4 transition hover:border-brand-300"
              >
                <span className="font-semibold">{exam.examName}</span>
                <span className="ml-2 text-xs text-muted">{exam.examYear}</span>
                <span className="block text-xs text-muted">
                  {exam.rows.length} {t('student.subject', lang)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
