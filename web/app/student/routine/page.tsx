import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { dayLabel } from '@/lib/routine'
import { getStudentContext } from '@/lib/student/context'
import { loadStudentRoutine } from '@/lib/student/routine-source'
import { usedPeriods, weekPlan } from '@/lib/student/routine'
import { dayOfWeek, schoolToday } from '@/lib/school-time'
import { PrintTrigger } from '@/components/print/print-trigger'
import { pageTitle } from '@/lib/student/metadata'

// The full weekly routine (#444). Sun–Thu across, periods down.
//
// The grid is exactly as tall as the periods the class actually uses, not a
// fixed twelve — a timetable padded with eight empty rows reads as broken. Gaps
// within the used range stay, because "no class third period" is information.
export const generateMetadata = pageTitle('student.routineTitle')

export default async function StudentRoutinePage() {
  const lang = await currentLang()
  const { supabase } = await getStudentContext()
  const { rows } = await loadStudentRoutine(supabase, lang)

  const week = weekPlan(rows)
  const periods = usedPeriods(rows)
  // Which column is now. A five-day grid with nothing marked made the student
  // count across from রবি every time they opened it.
  const todayColumn = dayOfWeek(schoolToday())

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">{t('student.routineTitle', lang)}</h1>
        {periods.length > 0 && (
          <PrintTrigger href="/student/routine/print" label={t('student.printRoutine', lang)} />
        )}
      </div>

      {!periods.length ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noRoutine', lang)}
        </p>
      ) : (
        <>
        {/* One card per day below sm. A weekly grid on a 390px screen was a
            595px table inside a 340px scroller: readable only by dragging, and
            never showing a whole day at once. */}
        <div className="space-y-3 sm:hidden">
          {week.map((d) => (
            <section
              key={d.day}
              className={`rounded-lg border bg-paper p-4 ${
                d.day === todayColumn ? 'border-brand-300 bg-brand-50/40' : 'border-line'
              }`}
            >
              <h2 className="mb-2 text-sm font-bold">
                {dayLabel(d.day, lang)}
                {d.day === todayColumn && (
                  <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {t('student.today', lang)}
                  </span>
                )}
              </h2>
              {!d.periods.length ? (
                <p className="text-xs text-muted">—</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.periods.map((slot) => (
                    <li key={slot.period} className="flex gap-3 py-2">
                      <span className="w-5 shrink-0 text-sm font-semibold text-brand-700">
                        {slot.period}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{slot.subject_name ?? '—'}</span>
                        <span className="block text-xs text-muted">
                          {[slot.teacher_name, slot.room_name].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="hidden overflow-x-auto rounded-lg border border-line bg-paper sm:block">
          <table className="w-full min-w-[36rem] border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  {t('student.period', lang)}
                </th>
                {week.map((d) => (
                  <th
                    key={d.day}
                    aria-current={d.day === todayColumn ? 'date' : undefined}
                    className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide ${
                      d.day === todayColumn ? 'bg-brand-50 text-brand-700' : 'text-muted'
                    }`}
                  >
                    {dayLabel(d.day, lang)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-sm font-semibold text-brand-700">{period}</td>
                  {week.map((d) => {
                    const slot = d.periods.find((p) => p.period === period)
                    return (
                      <td
                        key={d.day}
                        className={`px-3 py-2 align-top ${d.day === todayColumn ? 'bg-brand-50/50' : ''}`}
                      >
                        {slot ? (
                          <>
                            <span className="block text-sm font-medium">
                              {slot.subject_name ?? '—'}
                            </span>
                            <span className="block text-xs text-muted">
                              {[slot.teacher_name, slot.room_name].filter(Boolean).join(' · ')}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </main>
  )
}
