import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber, type MessageKey } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { groupSchedule, type ExamRoutineRow, type ScheduledExam, type SeatAssignment } from '@/lib/student/exam-schedule'
import { examUrgency, formatClock, type ExamUrgency } from '@/lib/student/dashboard'
import { matchesQ, pageOf } from '@/lib/student/table'
import { schoolToday } from '@/lib/school-time'
import { studentGroupTabs } from '@/lib/student-nav'
import { PrintTrigger } from '@/components/print/print-trigger'
import { pageTitle } from '@/lib/page-title'
import { PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'
import { ToneDot } from '@/components/ui/widgets'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { NoMatch } from '@/components/student/no-match'

// The Student's exam calendar (#450): dates, times, rooms, and their own seat.
//
// One row per paper. The seat is resolved, not a range. exam_seat_plans stores
// room + roll range; showing a Student "rolls 1-40 in Room 204" would make them
// work out where they sit. The view (0145) matches their roll into the one row
// that concerns them, and only once the plan is published.
export const generateMetadata = pageTitle('student.examsTitle')

// Same horizon as the home: today is red, 1..3 days is amber.
const TONE: Record<ExamUrgency, 'alert' | 'sun' | 'brand' | 'muted'> = { today: 'alert', soon: 'sun', later: 'brand', past: 'muted' }
const LABEL: Record<ExamUrgency, MessageKey> = {
  today: 'student.dash.examToday',
  soon: 'student.dash.examSoon',
  later: 'student.taskLater',
  past: 'student.col.past',
}

type Paper = { id: string; exam: ScheduledExam; paper: ExamRoutineRow }

export default async function StudentExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const lang = await currentLang()
  const { supabase } = await getStudentContext()
  const today = schoolToday()

  const [routine, seats] = await Promise.all([
    supabase.from('student_exam_routine').select('*').order('exam_date'),
    supabase.from('student_seat_assignment').select('*'),
  ])

  const exams = groupSchedule(
    (routine.data ?? []) as ExamRoutineRow[],
    (seats.data ?? []) as SeatAssignment[],
  )
  const upcoming = exams.reduce((n, e) => n + e.papers.filter((p) => p.exam_date >= today).length, 0)

  const papers: Paper[] = exams.flatMap((exam) =>
    exam.papers.map((paper, i) => ({ id: `${exam.examId}-${paper.exam_date}-${i}`, exam, paper })),
  )
  const shown = papers.filter(
    ({ exam, paper }) =>
      matchesQ(params.q, paper.subject_name) &&
      (!params.exam || exam.examId === params.exam) &&
      (!params.when || (params.when === 'past') === (paper.exam_date < today)),
  )
  const paged = pageOf(shown, params)
  // One pulse on the page: the first paper that is today.
  const todayId = shown.find((p) => examUrgency(p.paper.exam_date, today) === 'today')?.id

  const columns: Column<Paper>[] = [
    {
      key: 'subject',
      header: t('student.subject', lang),
      card: 'title',
      cell: ({ paper }) => <span className="font-semibold">{paper.subject_name ?? '—'}</span>,
    },
    {
      key: 'exam',
      header: t('student.col.exam', lang),
      cell: ({ exam }) => (
        <>
          {exam.examName} <span className="text-xs text-muted">{formatNumber(exam.examYear, lang, { useGrouping: false })}</span>
        </>
      ),
    },
    { key: 'date', header: t('student.examDate', lang), cell: ({ paper }) => formatDate(paper.exam_date, lang) },
    {
      key: 'time',
      header: t('student.examTime', lang),
      cell: ({ paper }) =>
        [formatClock(paper.start_time, lang), formatClock(paper.end_time, lang)].filter(Boolean).join(' – ') || (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'seat',
      header: t('student.col.seat', lang),
      cell: ({ exam, paper }) => (
        <>
          {paper.room_name ?? <span className="text-muted">—</span>}
          <div className="text-xs text-muted">
            {exam.seat ? (
              <>
                {t('student.yourSeat', lang)}: {t('student.room', lang)} {exam.seat.room_name ?? '—'}
                {exam.seat.roll_number !== null && ` · #${formatNumber(exam.seat.roll_number, lang)}`}
              </>
            ) : (
              t('student.seatPending', lang)
            )}
          </div>
        </>
      ),
    },
    {
      key: 'state',
      header: t('student.col.state', lang),
      card: 'badge',
      cell: ({ id, paper }) => {
        const u = examUrgency(paper.exam_date, today)
        return (
          <span className="inline-flex items-center gap-1.5">
            {id === todayId && <ToneDot tone="alert" pulse />}
            <Pill tone={TONE[u]}>{t(LABEL[u], lang)}</Pill>
          </span>
        )
      },
    },
  ]

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={t('student.examsTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.examsTitle', lang) }] }}
        badge={upcoming ? `${formatNumber(upcoming, lang)} ${t('student.dash.upcoming', lang)}` : undefined}
      />
      <SectionTabs
        tabs={studentGroupTabs('exams')}
        active="/student/exams"
        lang={lang}
        label={t('student.navGroup.exams', lang)}
      />

      {!exams.length ? (
        <EmptyState
          lang={lang}
          title={t('student.noExams', lang)}
          body={t('student.noExamsHint', lang)}
          action={{ href: '/student/results', label: t('student.nav.results', lang) }}
        />
      ) : (
        <DataTable
          rows={paged.items}
          rowId={(p) => p.id}
          rowLabel={(p) => `${p.exam.examName} ${p.paper.subject_name ?? ''}`.trim()}
          columns={columns}
          lang={lang}
          params={params}
          caption={t('student.examsTitle', lang)}
          search={{ placeholder: t('student.col.searchSubject', lang) }}
          filters={[
            {
              param: 'exam',
              label: t('student.col.exam', lang),
              options: exams.map((e) => ({ value: e.examId, label: `${e.examName} ${formatNumber(e.examYear, lang, { useGrouping: false })}` })),
            },
            {
              param: 'when',
              label: t('student.col.when', lang),
              options: [
                { value: 'upcoming', label: t('student.dash.upcoming', lang) },
                { value: 'past', label: t('student.col.past', lang) },
              ],
            },
          ]}
          rowActions={({ exam }) => (
            <PrintTrigger href={`/student/exams/${exam.examId}/admit-card`} label={t('student.printAdmitCard', lang)} />
          )}
          pagination={{ page: paged.page, totalPages: paged.totalPages, total: paged.total, pageSize: paged.pageSize }}
          empty={<NoMatch lang={lang} />}
        />
      )}
    </main>
  )
}
