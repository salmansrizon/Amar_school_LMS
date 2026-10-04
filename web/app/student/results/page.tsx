import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, formatNumber } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { groupByExam, missingSubjects, type ResultRow } from '@/lib/student/results'
import { rawTotal } from '@/lib/student/dashboard'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'

// Published exams only (#449). The gate is not in this query — it is in
// student_exam_result (0143), so no screen can forget it.
export const generateMetadata = pageTitle('student.resultsTitle')

export default async function StudentResultsPage() {
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const [{ data }, { data: classSubjects }] = await Promise.all([
    supabase.from('student_exam_result').select('*'),
    supabase.from('student_subject_option').select('id'),
  ])
  const exams = groupByExam((data ?? []) as ResultRow[])
  const fmt = (n: number) => formatNumber(n, lang, { maximumFractionDigits: 2 })

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={t('student.resultsTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.resultsTitle', lang) }] }}
        badge={exams.length ? fmt(exams.length) : undefined}
      />
      <SectionTabs
        tabs={studentGroupTabs('exams')}
        active="/student/results"
        lang={lang}
        label={t('student.navGroup.exams', lang)}
      />

      {!exams.length ? (
        <EmptyState
          lang={lang}
          title={t('student.noResults', lang)}
          body={t('student.noResultsHint', lang)}
          action={{ href: '/student/exams', label: t('student.nav.exams', lang) }}
        />
      ) : (
        <ul className="grid gap-grid lg:grid-cols-2">
          {exams.map((exam) => {
            const total = rawTotal(exam.rows)
            const incomplete = missingSubjects(exam, (classSubjects ?? []) as { id: string }[]).length > 0
            return (
              <li key={exam.examId}>
                <Link
                  href={`/student/results/${exam.examId}`}
                  className="block min-h-11 transition hover:opacity-90"
                >
                  <Card tone={incomplete ? 'sun' : 'brand'} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-semibold">{exam.examName}</span>
                      <span className="block text-xs text-muted">
                        {formatNumber(exam.examYear, lang, { useGrouping: false })} · {fmt(exam.rows.length)}{' '}
                        {t('student.subject', lang)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-extrabold">
                        {incomplete ? '—' : `${fmt(total.obtained)} / ${fmt(total.full)}`}
                      </span>
                      <span className="block text-xs text-muted">
                        {incomplete ? t('exams.incomplete', lang) : t('student.dash.totalMarks', lang)}
                      </span>
                    </span>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
