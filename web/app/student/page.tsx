import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { loadStudentRoutine } from '@/lib/student/routine-source'
import { todayAndTomorrow } from '@/lib/student/routine'
import { addDays, schoolToday } from '@/lib/school-time'
import { loadNoticeFeed } from '@/lib/student/notices-source'
import { loadStudentTasks } from '@/lib/student/tasks-read'
import { nextPaper, type ExamRoutineRow } from '@/lib/student/exam-schedule'
import { splitTasks, pendingCount } from '@/lib/student/tasks'
import Link from 'next/link'
import { DayPlanCard } from './day-plan'
import { LatestNotices, FeesDue } from './home-extras'
import { sortFees, totalFees, type FeeRecord } from '@/lib/student/fees'
import { pageTitle } from '@/lib/student/metadata'

// Student home (#444). Identity, then Today and Tomorrow.
//
// Not "upcoming classes": routine_slots has day_of_week and an ordinal period
// and no clock time anywhere, so there is nothing to count down to. Today and
// Tomorrow is what the routine on the classroom wall tells them, and it is
// honest about what the data actually knows.
export const generateMetadata = pageTitle('home.student')

export default async function StudentHome() {
  const lang = await currentLang()
  const ctx = await getStudentContext()
  const { student } = ctx

  const today = schoolToday()
  const [{ rows, offDays }, feed, tasks, feeRows] = await Promise.all([
    loadStudentRoutine(ctx.supabase, lang, [today, addDays(today, 1)]),
    loadNoticeFeed(ctx.supabase, 30),
    loadStudentTasks(ctx.supabase),
    ctx.supabase.from('student_fee_record').select('*'),
  ])

  // An exam is the most important thing on a student's calendar, so it sits
  // beside Today/Tomorrow rather than behind its own tab (#450).
  const { data: examRows } = await ctx.supabase
    .from('student_exam_routine')
    .select('*')
    .gte('exam_date', today)
    .order('exam_date')
    .limit(20)
  const upcoming = nextPaper((examRows ?? []) as ExamRoutineRow[], today)
  const pending = pendingCount(splitTasks(tasks, new Date()))
  const [todayPlan, tomorrowPlan] = todayAndTomorrow(today, rows, offDays)
  const feeTotals = totalFees(sortFees((feeRows.data ?? []) as FeeRecord[]))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const money = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)

  const facts = [
    { label: t('student.home.studentNo', lang), value: student.student_no ?? '—' },
    {
      label: t('student.home.class', lang),
      value: [student.class_name, student.section].filter(Boolean).join(' - ') || '—',
    },
    {
      label: t('student.home.roll', lang),
      value: student.roll_number !== null ? money(student.roll_number) : '—',
    },
  ]

  return (
    <main className="w-full p-6">
      <h1 className="mb-1 text-2xl font-extrabold">
        {t('student.home.greeting', lang)}, {student.full_name}
      </h1>
      <p className="mb-4 text-sm text-muted">{t('home.student', lang)}</p>

      {isReadOnly(ctx) && (
        <p className="mb-4 rounded-lg border border-sun bg-sun-soft px-4 py-3 text-sm text-sun-deep">
          {t('student.readOnly', lang)}
        </p>
      )}

      {pending > 0 && (
        <Link
          href="/student/tasks"
          className="mb-4 mr-2 inline-flex items-center gap-2 rounded-full border border-sun bg-sun-soft px-4 py-1.5 text-sm font-semibold text-sun-deep hover:brightness-95"
        >
          <span className="rounded-full bg-sun-deep px-2 text-xs text-white">{money(pending)}</span>
          {t('student.pendingCount', lang)}
        </Link>
      )}

      {feed.unread.size > 0 && (
        <Link
          href="/student/notices"
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-300 bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
        >
          <span className="rounded-full bg-brand-500 px-2 text-xs text-white">{money(feed.unread.size)}</span>
          {t('student.newCount', lang)}
        </Link>
      )}

      <section className="mb-6 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="rounded-lg border border-line bg-paper p-4">
            <div className="text-xl font-extrabold text-brand-700">{f.value}</div>
            <div className="text-xs text-muted">{f.label}</div>
          </div>
        ))}
      </section>

      {upcoming && (
        <Link
          href="/student/exams"
          className="mb-4 block max-w-4xl rounded-lg border border-brand-300 bg-brand-50 p-4 hover:bg-brand-100"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {t('student.upcomingExam', lang)}
          </span>
          <span className="block text-sm font-medium">
            {upcoming.exam_name} · {upcoming.subject_name ?? '—'}
          </span>
          <span className="block text-xs text-muted">
            {new Date(`${upcoming.exam_date}T00:00:00Z`).toLocaleDateString(
              lang === 'bn' ? 'bn-BD' : 'en-GB',
              { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' },
            )}
            {upcoming.start_time ? ` · ${upcoming.start_time}` : ''}
            {upcoming.room_name ? ` · ${upcoming.room_name}` : ''}
          </span>
        </Link>
      )}

      <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
        <DayPlanCard plan={todayPlan} title={t('student.today', lang)} lang={lang} />
        <DayPlanCard plan={tomorrowPlan} title={t('student.tomorrow', lang)} lang={lang} />
        <LatestNotices notices={feed.notices} unread={feed.unread} lang={lang} locale={locale} />
        <FeesDue due={feeTotals.due} lang={lang} money={money} />
      </div>
    </main>
  )
}
