import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import {
  combinedRollList,
  formatRollList,
  roomNoticeBlocks,
  type PrintRoom,
  type SeatAllocation,
} from '@/lib/seat-plan-print'
import { PrintPage, InstituteHeader, PaginatedSheet } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'
import { embeddedBuildingName, roomVenueLabel } from '@/lib/venues'

// Notice-board seat plan (issue #96, docs/improvement.md §2B; ADR 0007 —
// browser-native print). Organised by room, because that is what a student
// walks up to: one block per occupied room, one line per exam seated in it,
// and the combined roll list underneath so a mixed room can be read at a
// glance rather than by comparing overlapping ranges.
//
// Every exam sharing a room with this one appears, otherwise the notice would
// claim a room holds fewer students than it does.

export default async function SeatPlanPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { id } = await params
  const { date: sittingDate } = await searchParams
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

  // The rooms this exam occupies, then everything seated in those rooms.
  const { data: ownRows } = await supabase
    .from('exam_seat_plans')
    .select('room_id')
    .eq('exam_id', id)
  const roomIds = [...new Set((ownRows ?? []).map((r) => r.room_id))]

  const [{ data: seatRows }, { data: rooms }, { data: exams }, { data: classes }, { data: routine }, { data: subjects }] =
    await Promise.all([
      roomIds.length
        ? supabase
            .from('exam_seat_plans')
            .select('id, exam_id, room_id, roll_start, roll_end')
            .in('room_id', roomIds)
        : Promise.resolve({ data: [] as { id: string; exam_id: string; room_id: string; roll_start: number; roll_end: number }[] }),
      supabase.from('rooms').select('id, name, capacity, buildings(name)'),
      supabase.from('exams').select('id, name, exam_year, class_id'),
      supabase.from('classes').select('id, name, section'),
      supabase.from('exam_routine_entries').select('exam_id, subject_id, exam_date'),
      supabase.from('subjects').select('id, name'),
    ])

  const classById = new Map((classes ?? []).map((c) => [c.id, c]))
  const examById = new Map((exams ?? []).map((e) => [e.id, e]))
  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]))

  // A seat plan is not subject-specific by itself — the seating holds for
  // every sitting of the exam. But a notice board is posted for one exam DAY,
  // and §2B wants the Subject named, so `?date=` narrows the routine to that
  // day: each exam then contributes the paper it actually sits that morning.
  // Without a date the sheet lists every paper the exam schedules, which is
  // the honest answer to "which papers sit here" across the whole exam.
  const sittings = (routine ?? []).filter((e) => !sittingDate || e.exam_date === sittingDate)
  const subjectsByExam = new Map<string, string[]>()
  for (const entry of sittings) {
    const name = subjectName.get(entry.subject_id)
    if (!name) continue
    const list = subjectsByExam.get(entry.exam_id) ?? []
    if (!list.includes(name)) list.push(name)
    subjectsByExam.set(entry.exam_id, list)
  }

  // Every date this exam sits, for the picker on screen.
  const examDates = [
    ...new Set((routine ?? []).filter((e) => e.exam_id === id).map((e) => e.exam_date)),
  ].sort()

  const printRooms: PrintRoom[] = (rooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    buildingName: embeddedBuildingName(r),
  }))

  const allocations: SeatAllocation[] = (seatRows ?? []).map((row) => {
    const rowExam = examById.get(row.exam_id)
    const cls = rowExam?.class_id ? classById.get(rowExam.class_id) : undefined
    return {
      id: row.id,
      room_id: row.room_id,
      roll_start: row.roll_start,
      roll_end: row.roll_end,
      examName: rowExam ? `${rowExam.name} (${rowExam.exam_year})` : '—',
      className: cls?.name ?? '—',
      section: cls?.section ?? null,
      subject: subjectsByExam.get(row.exam_id)?.join(', ') ?? null,
    }
  })

  const blocks = roomNoticeBlocks(allocations, printRooms)
  const examLabel = `${exam.name} (${exam.exam_year})`

  const thClass = 'border border-line-strong bg-paper-muted p-1.5 text-left font-semibold'
  const tdClass = 'border border-line-strong p-1.5 align-top'

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/school/exams/${id}/seat-plan`}
          aria-label={t('seatPlan.title', lang)}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div className="flex items-center gap-3">
          {examDates.length > 1 && (
            <nav className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">{t('seatPlan.forSitting', lang)}</span>
              <Link
                href={`/school/exams/${id}/seat-plan/print`}
                className={`rounded-full border px-2 py-0.5 font-semibold ${
                  sittingDate ? 'border-line text-muted hover:bg-paper-muted' : 'border-brand-500 text-brand-600'
                }`}
              >
                {t('seatPlan.allSittings', lang)}
              </Link>
              {examDates.map((d) => (
                <Link
                  key={d}
                  href={`/school/exams/${id}/seat-plan/print?date=${d}`}
                  className={`rounded-full border px-2 py-0.5 font-semibold ${
                    sittingDate === d ? 'border-brand-500 text-brand-600' : 'border-line text-muted hover:bg-paper-muted'
                  }`}
                >
                  {d}
                </Link>
              ))}
            </nav>
          )}
          <PrintButton label={t('print.print', lang)} />
        </div>
      </div>

      <PrintPage>
        <PaginatedSheet
          header={
            <InstituteHeader
              institute={institute}
              docTitle={`${t('seatPlan.docWord', lang)} — ${examLabel}${sittingDate ? ` — ${sittingDate}` : ''}`}
            />
          }
        >
          {!blocks.length ? (
            <p className="text-sm text-muted">{t('seatPlan.none', lang)}</p>
          ) : (
            <div className="space-y-4">
              {blocks.map((block) => {
                const rolls = combinedRollList(block.rows)
                return (
                  <section key={block.room.id} className="break-inside-avoid">
                    <div className="mb-1 flex items-baseline justify-between border-b border-line-strong pb-1">
                      <h2 className="text-sm font-bold">
                        {roomVenueLabel(block.buildingName, block.room.name)}
                      </h2>
                      <span className="text-xs text-muted">
                        {t('seatPlan.capacity', lang)}: {block.room.capacity} · {t('seatPlan.studentCount', lang)}:{' '}
                        {block.seatCount}
                      </span>
                    </div>
                    <table className="w-full table-fixed border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className={thClass}>{t('seatPlan.exam', lang)}</th>
                          <th className={thClass}>{t('seatPlan.class', lang)}</th>
                          <th className={thClass}>{t('seatPlan.section', lang)}</th>
                          <th className={thClass}>{t('seatPlan.subject', lang)}</th>
                          <th className={thClass}>{t('seatPlan.rollRange', lang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row) => (
                          <tr key={row.id}>
                            <td className={tdClass}>{row.examName}</td>
                            <td className={tdClass}>{row.className}</td>
                            <td className={tdClass}>{row.section ?? '—'}</td>
                            <td className={tdClass}>{row.subject ?? '—'}</td>
                            <td className={tdClass}>
                              {row.roll_start} – {row.roll_end}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* The union across every exam in this room: what a student
                        actually scans for. Computed at print time, never stored. */}
                    <p className="mt-1 text-xs">
                      <span className="font-semibold">{t('seatPlan.allRolls', lang)}: </span>
                      {formatRollList(rolls)}
                    </p>
                  </section>
                )
              })}
            </div>
          )}
        </PaginatedSheet>
      </PrintPage>
    </main>
  )
}
