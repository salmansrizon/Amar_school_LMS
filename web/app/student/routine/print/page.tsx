import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { dayLabel } from '@/lib/routine'
import { getStudentContext } from '@/lib/student/context'
import { loadStudentRoutine } from '@/lib/student/routine-source'
import { usedPeriods, weekPlan } from '@/lib/student/routine'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import { classSectionLabel } from '@/lib/students'
import { PrintPage, InstituteHeader, InfoGrid } from '@/components/print/pieces'

// The weekly routine on paper (ADR 0007, browser-native).
//
// A routine is the one thing in this portal that belongs on a wall or inside a
// notebook, and it was the one screen with no way to print it.
export default async function StudentRoutinePrintPage() {
  const lang = await currentLang()
  const { supabase, student } = await getStudentContext()

  const [{ rows }, institute] = await Promise.all([
    loadStudentRoutine(supabase, lang),
    loadInstitutePrintHeader(supabase, lang),
  ])

  const week = weekPlan(rows)
  const periods = usedPeriods(rows)

  return (
    <PrintPage>
      <InstituteHeader institute={institute ?? undefined} docTitle={t('student.routineTitle', lang)} />

      <InfoGrid
        rows={[
          { label: t('students.name', lang), value: student.full_name },
          { label: t('students.studentNo', lang), value: student.student_no ?? '—' },
          {
            label: t('students.classSection', lang),
            value: classSectionLabel(student.class_name, student.section) ?? '—',
          },
          { label: t('students.roll', lang), value: student.roll_number ?? '—' },
        ]}
      />

      <table className="print-keep mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-line px-2 py-1 text-left">{t('student.period', lang)}</th>
            {week.map((d) => (
              <th key={d.day} className="border border-line px-2 py-1 text-left">
                {dayLabel(d.day, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period}>
              <td className="border border-line px-2 py-1 font-semibold">{period}</td>
              {week.map((d) => {
                const slot = d.periods.find((p) => p.period === period)
                return (
                  <td key={d.day} className="border border-line px-2 py-1 align-top">
                    {slot ? (
                      <>
                        <span className="block">{slot.subject_name ?? '—'}</span>
                        <span className="block text-xs">{slot.teacher_name ?? ''}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </PrintPage>
  )
}
