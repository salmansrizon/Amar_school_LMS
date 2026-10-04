import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber, type MessageKey } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { groupSchedule, type ExamRoutineRow, type SeatAssignment } from '@/lib/student/exam-schedule'
import { examUrgency, formatClock, type ExamUrgency } from '@/lib/student/dashboard'
import { schoolToday } from '@/lib/school-time'
import { studentGroupTabs } from '@/lib/student-nav'
import { PrintTrigger } from '@/components/print/print-trigger'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader, type Tone } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'

// The Student's exam calendar (#450): dates, times, rooms, and their own seat.
//
// The seat is resolved, not a range. exam_seat_plans stores room + roll range;
// showing a Student "rolls 1-40 in Room 204" would make them work out where
// they sit. The view (0145) matches their roll into the one row that concerns
// them, and only once the plan is published.
export const generateMetadata = pageTitle('student.examsTitle')

// Same horizon as the home: today is red, 1..3 days is amber.
const RAIL: Record<ExamUrgency, Tone> = { today: 'alert', soon: 'sun', later: 'brand', past: 'muted' }
const LABEL: Partial<Record<ExamUrgency, MessageKey>> = { today: 'student.dash.examToday', soon: 'student.dash.examSoon' }
const LABEL_CLASS: Partial<Record<ExamUrgency, string>> = { today: 'text-alert-deep', soon: 'text-sun-deep' }

export default async function StudentExamsPage() {
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
        <div className="grid gap-grid lg:grid-cols-2">
          {exams.map((exam) => {
            const next = exam.papers.find((p) => p.exam_date >= today)
            const urgency: ExamUrgency = next ? examUrgency(next.exam_date, today) : 'past'
            return (
              <Card key={exam.examId} tone={RAIL[urgency]}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold">
                    {exam.examName}{' '}
                    <span className="text-sm font-normal text-muted">
                      {formatNumber(exam.examYear, lang, { useGrouping: false })}
                    </span>
                  </h2>
                  <PrintTrigger
                    href={`/student/exams/${exam.examId}/admit-card`}
                    label={t('student.printAdmitCard', lang)}
                  />
                </div>

                <p className="mb-3 text-sm">
                  {exam.seat ? (
                    <>
                      <span className="font-semibold">{t('student.yourSeat', lang)}:</span>{' '}
                      {t('student.room', lang)} {exam.seat.room_name ?? '—'}
                      {exam.seat.roll_number !== null && (
                        <span className="text-muted"> · #{formatNumber(exam.seat.roll_number, lang)}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">{t('student.seatPending', lang)}</span>
                  )}
                </p>

                <ul className="divide-y divide-line">
                  {exam.papers.map((p, i) => {
                    const u = examUrgency(p.exam_date, today)
                    const clock = [formatClock(p.start_time, lang), formatClock(p.end_time, lang)].filter(Boolean).join(' – ')
                    return (
                      <li key={`${p.exam_date}-${i}`} className={`flex items-baseline justify-between gap-3 py-2 ${u === 'past' ? 'opacity-60' : ''}`}>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{p.subject_name ?? '—'}</span>
                          {LABEL[u] && <span className={`block text-xs font-bold ${LABEL_CLASS[u]}`}>{t(LABEL[u]!, lang)}</span>}
                        </span>
                        <span className="text-right text-xs text-muted">
                          <span className="block">{formatDate(p.exam_date, lang)}</span>
                          {(clock || p.room_name) && (
                            <span className="block">{[clock, p.room_name].filter(Boolean).join(' · ')}</span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
