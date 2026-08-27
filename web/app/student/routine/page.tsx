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
        // Scrolls sideways on a phone rather than crushing five columns.
        <div className="overflow-x-auto rounded-lg border border-line bg-paper">
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
      )}
    </main>
  )
}
