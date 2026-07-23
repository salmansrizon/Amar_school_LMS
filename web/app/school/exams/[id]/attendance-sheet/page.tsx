import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import { sittingLabel, studentsInRanges, type SheetStudent } from '@/lib/exam-attendance-sheet'
import { PrintPage, InstituteHeader, InfoGrid, SignatureRow } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'

// Exam attendance sheet (issue #97, docs/improvement.md §4; ADR 0007).
//
// One sheet = one room × one routine entry — the unit an invigilator is handed
// (map #91 grilling decision 10).
//
// Entry-point decision: ONE route serves both cases. `?entry=<routineEntryId>`
// alone prints every room for that sitting (the batch an exam controller
// actually wants — invigilators are briefed together); adding `&room=<roomId>`
// prints the single sheet. A separate batch page would duplicate this whole
// loader for one query-string difference.

export default async function ExamAttendanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ entry?: string; room?: string }>
}) {
  const { id } = await params
  const { entry: entryId, room: roomFilter } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [institute, { data: exam }] = await Promise.all([
    loadInstitutePrintHeader(supabase, lang),
    supabase.from('exams').select('id, name, exam_year, class_id').eq('id', id).maybeSingle(),
  ])
  if (!institute || !exam) notFound()
  const examLabel = `${exam.name} (${exam.exam_year})`

  const { data: entries } = await supabase
    .from('exam_routine_entries')
    .select('id, subject_id, exam_date, start_time, end_time')
    .eq('exam_id', id)
    .order('exam_date')

  const { data: subjects } = await supabase.from('subjects').select('id, name')
  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]))

  const backLink = (
    <Link
      href={`/school/exams/${id}`}
      aria-label={t('examSetup.title', lang)}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
    </Link>
  )

  // No sitting chosen yet: pick one. A sitting, not a room — the room list
  // follows from the seat plan.
  const sitting = (entries ?? []).find((e) => e.id === entryId)
  if (!sitting) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">{t('examAttendanceSheet.title', lang)}</h1>
          {backLink}
        </div>
        <p className="mb-4 text-sm text-muted">{examLabel}</p>
        {!entries?.length ? (
          <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
            {t('examAttendanceSheet.noRoutine', lang)}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-paper shadow-card">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between p-4 text-sm">
                <span>
                  {sittingLabel({
                    subject: subjectName.get(e.subject_id) ?? '—',
                    exam_date: e.exam_date,
                    start_time: e.start_time,
                    end_time: e.end_time,
                  })}
                </span>
                <Link
                  href={`/school/exams/${id}/attendance-sheet?entry=${e.id}${roomFilter ? `&room=${roomFilter}` : ''}`}
                  className="text-brand-600 hover:underline"
                >
                  {t('examAttendanceSheet.openSheets', lang)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    )
  }

  const [{ data: seatRows }, { data: rooms }, { data: cls }] = await Promise.all([
    supabase
      .from('exam_seat_plans')
      .select('room_id, roll_start, roll_end')
      .eq('exam_id', id),
    supabase.from('rooms').select('id, name, buildings(name)'),
    exam.class_id
      ? supabase.from('classes').select('name, section').eq('id', exam.class_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  let students: SheetStudent[] = []
  if (cls) {
    let query = supabase
      .from('students')
      .select('id, full_name, roll_number, class_name, section')
      .eq('class_name', cls.name)
      .is('archived_at', null)
    query = cls.section ? query.eq('section', cls.section) : query.is('section', null)
    const { data } = await query
    students = (data ?? []) as SheetStudent[]
  }

  const roomById = new Map(
    (rooms ?? []).map((r) => [
      r.id,
      { name: r.name, buildingName: (r.buildings as unknown as { name: string } | null)?.name ?? '' },
    ]),
  )

  // One sheet per room this exam occupies; `?room=` narrows it to one.
  const roomIds = [...new Set((seatRows ?? []).map((r) => r.room_id))].filter(
    (roomId) => !roomFilter || roomId === roomFilter,
  )

  const label = sittingLabel({
    subject: subjectName.get(sitting.subject_id) ?? '—',
    exam_date: sitting.exam_date,
    start_time: sitting.start_time,
    end_time: sitting.end_time,
  })

  const thClass = 'border border-line-strong bg-paper-muted p-1.5 text-left text-xs font-semibold'
  const tdClass = 'border border-line-strong p-1.5 text-xs'

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/school/exams/${id}/attendance-sheet${roomFilter ? `?room=${roomFilter}` : ''}`}
          className="text-sm text-brand-600 hover:underline"
        >
          {t('examAttendanceSheet.otherSittings', lang)}
        </Link>
        <PrintButton label={t('print.print', lang)} />
      </div>

      {!roomIds.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card print:hidden">
          {t('examAttendanceSheet.noSeatPlan', lang)}
        </p>
      ) : (
        roomIds.map((roomId) => {
          const room = roomById.get(roomId)
          const ranges = (seatRows ?? []).filter((r) => r.room_id === roomId)
          const seated = studentsInRanges(students, ranges)
          return (
            <PrintPage key={roomId}>
              <InstituteHeader
                institute={institute}
                docTitle={`${t('examAttendanceSheet.docWord', lang)} — ${examLabel}`}
              />
              <InfoGrid
                rows={[
                  { label: t('examAttendanceSheet.subject', lang), value: subjectName.get(sitting.subject_id) ?? '—' },
                  { label: t('examAttendanceSheet.date', lang), value: sitting.exam_date },
                  {
                    label: t('examAttendanceSheet.time', lang),
                    value: `${sitting.start_time ?? '—'} – ${sitting.end_time ?? '—'}`,
                  },
                  { label: t('venues.building', lang), value: room?.buildingName || '—' },
                  { label: t('examAttendanceSheet.room', lang), value: room?.name ?? '—' },
                  { label: t('examAttendanceSheet.candidates', lang), value: seated.length },
                ]}
              />

              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={`${thClass} w-12`}>#</th>
                    <th className={`${thClass} w-20`}>{t('examAttendanceSheet.roll', lang)}</th>
                    <th className={thClass}>{t('examAttendanceSheet.studentName', lang)}</th>
                    <th className={`${thClass} w-28`}>{t('examAttendanceSheet.classSection', lang)}</th>
                    <th className={`${thClass} w-48`}>{t('examAttendanceSheet.signature', lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {seated.map((student, i) => (
                    <tr key={student.id}>
                      <td className={tdClass}>{i + 1}</td>
                      <td className={tdClass}>{student.roll_number}</td>
                      <td className={tdClass}>{student.full_name}</td>
                      <td className={tdClass}>
                        {student.class_name}
                        {student.section ? ` / ${student.section}` : ''}
                      </td>
                      {/* Blank on purpose — the candidate signs on paper. */}
                      <td className={`${tdClass} h-8`} />
                    </tr>
                  ))}
                </tbody>
              </table>

              <SignatureRow
                labels={[
                  t('examAttendanceSheet.invigilator', lang),
                  t('examAttendanceSheet.examController', lang),
                  t('markSheet.headTeacher', lang),
                ]}
              />
              <p className="mt-3 text-center text-xs text-muted">{label}</p>
            </PrintPage>
          )
        })
      )}
    </main>
  )
}
