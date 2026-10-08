import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, formatNumber } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { groupByExam, missingSubjects, type ResultRow } from '@/lib/student/results'
import { rawTotal } from '@/lib/student/dashboard'
import { matchesQ, pageOf } from '@/lib/student/table'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { NoMatch } from '@/components/student/no-match'

// Published exams only (#449). The gate is not in this query — it is in
// student_exam_result (0143), so no screen can forget it.
export const generateMetadata = pageTitle('student.resultsTitle')

export default async function StudentResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const [{ data }, { data: classSubjects }] = await Promise.all([
    supabase.from('student_exam_result').select('*').not('obtained_marks', 'is', null),
    supabase.from('student_subject_option').select('id'),
  ])
  const exams = groupByExam((data ?? []) as ResultRow[])
  const fmt = (n: number) => formatNumber(n, lang, { maximumFractionDigits: 2 })
  const year = (y: number) => formatNumber(y, lang, { useGrouping: false })

  type Exam = (typeof exams)[number]
  const isIncomplete = (exam: Exam) => missingSubjects(exam, (classSubjects ?? []) as { id: string }[]).length > 0
  const years = [...new Set(exams.map((e) => e.examYear))].sort((a, b) => b - a)
  const shown = exams.filter((e) => matchesQ(params.q, e.examName) && (!params.year || String(e.examYear) === params.year))
  const paged = pageOf(shown, params)

  const columns: Column<Exam>[] = [
    {
      key: 'exam',
      header: t('student.col.exam', lang),
      card: 'title',
      cell: (exam) => (
        <Link
          href={`/student/results/${exam.examId}`}
          className="inline-flex min-h-11 items-center font-semibold hover:text-brand-600 hover:underline md:min-h-0"
        >
          {exam.examName}
        </Link>
      ),
    },
    { key: 'year', header: t('student.col.year', lang), cell: (exam) => year(exam.examYear) },
    {
      key: 'total',
      header: t('student.dash.totalMarks', lang),
      cell: (exam) => {
        if (isIncomplete(exam)) return <span className="text-muted">—</span>
        const total = rawTotal(exam.rows)
        return <span className="font-semibold">{`${fmt(total.obtained)} / ${fmt(total.full)}`}</span>
      },
    },
    {
      key: 'state',
      header: t('student.col.state', lang),
      card: 'badge',
      cell: (exam) =>
        isIncomplete(exam) ? (
          <Pill tone="sun">{t('exams.incomplete', lang)}</Pill>
        ) : (
          <Pill tone="mint">{t('student.col.complete', lang)}</Pill>
        ),
    },
  ]

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
        <DataTable
          rows={paged.items}
          rowId={(e) => e.examId}
          rowLabel={(e) => e.examName}
          columns={columns}
          lang={lang}
          params={params}
          caption={t('student.resultsTitle', lang)}
          search={{ placeholder: t('student.col.search', lang) }}
          filters={
            years.length > 1
              ? [{ param: 'year', label: t('student.col.year', lang), options: years.map((y) => ({ value: String(y), label: year(y) })) }]
              : []
          }
          pagination={{ page: paged.page, totalPages: paged.totalPages, total: paged.total, pageSize: paged.pageSize }}
          empty={<NoMatch lang={lang} />}
        />
      )}
    </main>
  )
}
