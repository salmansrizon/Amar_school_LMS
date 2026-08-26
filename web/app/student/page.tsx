import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { loadStudentRoutine } from '@/lib/student/routine-source'
import { todayAndTomorrow } from '@/lib/student/routine'
import { addDays, schoolToday } from '@/lib/school-time'
import { loadNoticeFeed } from '@/lib/student/notices-source'
import Link from 'next/link'
import { DayPlanCard } from './day-plan'

// Student home (#444). Identity, then Today and Tomorrow.
//
// Not "upcoming classes": routine_slots has day_of_week and an ordinal period
// and no clock time anywhere, so there is nothing to count down to. Today and
// Tomorrow is what the routine on the classroom wall tells them, and it is
// honest about what the data actually knows.
export default async function StudentHome() {
  const lang = await currentLang()
  const ctx = await getStudentContext()
  const { student } = ctx

  const today = schoolToday()
  const [{ rows, offDays }, feed] = await Promise.all([
    loadStudentRoutine(ctx.supabase, lang, [today, addDays(today, 1)]),
    loadNoticeFeed(ctx.supabase, 30),
  ])
  const [todayPlan, tomorrowPlan] = todayAndTomorrow(today, rows, offDays)

  const facts = [
    { label: t('student.home.studentNo', lang), value: student.student_no ?? '—' },
    {
      label: t('student.home.class', lang),
      value: [student.class_name, student.section].filter(Boolean).join(' - ') || '—',
    },
    { label: t('student.home.roll', lang), value: student.roll_number ?? '—' },
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

      {feed.unread.size > 0 && (
        <Link
          href="/student/notices"
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-300 bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
        >
          <span className="rounded-full bg-brand-500 px-2 text-xs text-white">{feed.unread.size}</span>
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

      <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
        <DayPlanCard plan={todayPlan} title={t('student.today', lang)} lang={lang} />
        <DayPlanCard plan={tomorrowPlan} title={t('student.tomorrow', lang)} lang={lang} />
      </div>
    </main>
  )
}
