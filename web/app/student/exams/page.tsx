import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { groupSchedule, type ExamRoutineRow, type SeatAssignment } from '@/lib/student/exam-schedule'
import { PrintTrigger } from '@/components/print/print-trigger'

// The Student's exam calendar (#450): dates, times, rooms, and their own seat.
//
// The seat is resolved, not a range. exam_seat_plans stores room + roll range;
// showing a Student "rolls 1-40 in Room 204" would make them work out where
// they sit. The view (0145) matches their roll into the one row that concerns
// them, and only once the plan is published.
export default async function StudentExamsPage() {
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const [routine, seats] = await Promise.all([
    supabase.from('student_exam_routine').select('*').order('exam_date'),
    supabase.from('student_seat_assignment').select('*'),
  ])

  const exams = groupSchedule(
    (routine.data ?? []) as ExamRoutineRow[],
    (seats.data ?? []) as SeatAssignment[],
  )
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="w-full max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-extrabold">{t('student.examsTitle', lang)}</h1>

      {!exams.length ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noExams', lang)}
        </p>
      ) : (
        <div className="space-y-4">
          {exams.map((exam) => (
            <section key={exam.examId} className="rounded-lg border border-line bg-paper p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">
                  {exam.examName} <span className="text-sm text-muted">{exam.examYear}</span>
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
                      <span className="text-muted"> · #{exam.seat.roll_number}</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted">{t('student.seatPending', lang)}</span>
                )}
              </p>

              <ul className="divide-y divide-line">
                {exam.papers.map((p, i) => (
                  <li key={`${p.exam_date}-${i}`} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="text-sm font-medium">{p.subject_name ?? '—'}</span>
                    <span className="text-right text-xs text-muted">
                      <span className="block">
                        {new Date(`${p.exam_date}T00:00:00Z`).toLocaleDateString(locale, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          timeZone: 'UTC',
                        })}
                      </span>
                      {p.start_time && (
                        <span className="block">
                          {p.start_time}
                          {p.end_time ? `–${p.end_time}` : ''}
                          {p.room_name ? ` · ${p.room_name}` : ''}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
