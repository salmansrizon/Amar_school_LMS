import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { overlappingRowIds, overCapacityRoomIds } from '@/lib/exam-setup'
import {
  AddSeatPlanRowForm,
  GeneratePanel,
  PublishButton,
  SeatPlanTable,
  type BuildingOption,
  type ExamOption,
  type RoomOption,
  type SeatPlanRow,
} from './seat-plan-controls'
import { embeddedBuildingName } from '@/lib/venues'

// Layout per ui/school-owner/seat-plan.html: toolbar (exam label; Generate +
// Publish) with an overlap-warning banner over the Room/Capacity/Assigned
// Roll Range/Student Count/Status table. Room-capacity is a hard DB
// constraint (enforce_exam_seat_plan_school); duplicate-range/overlap is
// re-checked server-side by publish_seat_plan even though the client already
// disables the button (migration 0039).

export default async function SeatPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, status, class_id, seat_plan_published_at')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const closed = exam.status === 'closed'

  // Mixed seating (issue #95): capacity is a room-wide budget, so the page
  // needs every exam's allocation in these rooms, not just this exam's.
  const [{ data: rows }, { data: allRows }, { data: rooms }, { data: buildings }, { data: otherExams }] =
    await Promise.all([
      supabase.from('exam_seat_plans').select('id, room_id, roll_start, roll_end').eq('exam_id', id),
      supabase.from('exam_seat_plans').select('id, room_id, roll_start, roll_end'),
      supabase
        .from('rooms')
        .select('id, name, capacity, building_id, buildings(name)')
        .eq('is_active', true)
        .order('name'),
      supabase.from('buildings').select('id, name').order('name'),
      supabase
        .from('exams')
        .select('id, name, exam_year')
        .eq('status', 'open')
        .neq('id', id)
        .not('class_id', 'is', null)
        .order('exam_year', { ascending: false }),
    ])

  let rolls: number[] = []
  if (exam.class_id) {
    const { data: cls } = await supabase.from('classes').select('name, section').eq('id', exam.class_id).maybeSingle()
    if (cls) {
      let query = supabase
        .from('students')
        .select('roll_number')
        .eq('class_name', cls.name)
        .is('archived_at', null)
        .not('roll_number', 'is', null)
      query = cls.section ? query.eq('section', cls.section) : query.is('section', null)
      const { data: students } = await query
      rolls = (students ?? []).map((s) => s.roll_number as number)
    }
  }

  const seatRows = (rows ?? []) as SeatPlanRow[]
  const roomOpts = (rooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    building_id: r.building_id,
    buildingName: embeddedBuildingName(r),
  })) as RoomOption[]
  const buildingOpts = (buildings ?? []) as BuildingOption[]
  const examOpts: ExamOption[] = (otherExams ?? []).map((e) => ({
    id: e.id,
    label: `${e.name} (${e.exam_year})`,
  }))
  const overlapping = overlappingRowIds(seatRows)
  const overCapacity = overCapacityRoomIds((allRows ?? []) as SeatPlanRow[], roomOpts)
  const hasConflict =
    seatRows.some((r) => overlapping.has(r.id)) ||
    seatRows.some((r) => overCapacity.has(r.room_id))
  const examLabel = `${exam.name} (${exam.exam_year})`

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('seatPlan.title', lang)}</h1>
        <Link href={`/school/exams/${exam.id}`} aria-label={t('examSetup.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">{examLabel}</span>
        <div className="flex items-center gap-4">
          <Link
            href={`/school/exams/${exam.id}/seat-plan/print`}
            className="text-sm text-brand-600 hover:underline"
          >
            {t('seatPlan.print', lang)}
          </Link>
          <Link
            href={`/school/exams/${exam.id}/attendance-sheet`}
            className="text-sm text-brand-600 hover:underline"
          >
            {t('examAttendanceSheet.title', lang)}
          </Link>
        </div>
        {!closed && (
          <div className="flex items-center gap-2">
            <PublishButton
              examId={exam.id}
              hasConflict={hasConflict}
              published={Boolean(exam.seat_plan_published_at)}
              lang={lang}
            />
          </div>
        )}
      </div>

      {!closed && exam.class_id && (
        <div className="mb-4 flex">
          <GeneratePanel
            examId={exam.id}
            otherExams={examOpts}
            buildings={buildingOpts}
            rooms={roomOpts}
            lang={lang}
          />
        </div>
      )}

      {!exam.class_id ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('seatPlan.noClassSet', lang)}
        </p>
      ) : (
        <>
          {hasConflict && (
            <div className="mb-4 rounded-lg border border-alert bg-alert-soft p-4">
              <p className="text-sm font-semibold text-alert-deep">{t('seatPlan.overlapWarning', lang)}</p>
            </div>
          )}

          <section className="rounded-lg border border-line bg-paper p-4 shadow-card">
            {!seatRows.length ? (
              <p className="text-sm text-muted">{t('seatPlan.none', lang)}</p>
            ) : (
              <SeatPlanTable
                examId={exam.id}
                rows={seatRows}
                rooms={roomOpts}
                rolls={rolls}
                overCapacityRooms={overCapacity}
                disabled={closed}
                lang={lang}
              />
            )}
            {!closed && <AddSeatPlanRowForm examId={exam.id} rooms={roomOpts} lang={lang} />}
          </section>
        </>
      )}
    </main>
  )
}
