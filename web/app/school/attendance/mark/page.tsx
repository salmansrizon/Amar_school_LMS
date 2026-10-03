import Form from 'next/form'
import Link from 'next/link'
import { BookOpen, CalendarClock, CalendarOff, ClipboardList, TrendingUp, UserCheck, UserX, Users } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { studentRegister } from '@/lib/school/roster-source'
import { studentAttendanceRates } from '@/lib/school/attendance-rate-source'
import { attendanceRate, unmarkedOfferings } from '@/lib/dashboard'
import { selectAllRows } from '@/lib/supabase/select-all'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { QuickActions, StatCard, StatGrid, WarningBanner, WorkflowCard } from '@/components/ui/widgets'
import { RowActionPill } from '@/components/data-table/row-action-pill'
import { AttendanceTabs } from '../attendance-tabs'
import { MarkAttendanceForm } from './mark-form'
import { dateInputClass } from '@/components/ui/field'
import { ClassSectionSelect } from '@/components/ui/class-section-select'
import { EmptyState } from '@/components/ui/states'

// Layout per ui/school-owner/attendance-student-mark.html, chromed to the
// exam-landing pattern (map 013, new_ui/03-academics/attendance): header +
// one-line warning banner + stat cards stay above the marking sheet, which
// keeps its own layout unchanged (the "grids keep their layout" rule) —
// class/section/date filters, bulk all-present/all-absent, per-row
// present/absent + absence cause, Roll number leading each row (roll_number
// landed with #27's admission profile, merged after this ticket first
// shipped). Two workflow cards close the page: classes not yet marked today,
// and the pending leave-request queue.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// Each kind of empty gets its own sentence and its own way out. "No students in
// this class" and "you have no class" are different problems for different
// people, and only one of them is solved by admitting a student.
const EMPTY_TITLE = {
  unassigned: 'students.noClassAssigned',
  'no-students': 'students.none',
  'no-match': 'attendance.none',
} as const

const EMPTY_ACTION = {
  unassigned: { href: '/school', label: 'denied.back' },
  'no-students': { href: '/school/students/new', label: 'students.newAdmission' },
  'no-match': { href: '/school/attendance/mark', label: 'attendance.allClasses' },
} as const

export default async function MarkAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classSection?: string; date?: string }>
}) {
  const { classSection = '', date = todayIso() } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, userId, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  // Started-year history is the signal (#609/#612), same boolean T6/#615
  // threaded into the Fee Structures Offering picker.
  const showYear = startedAcademicYears.length > 1

  // One call, one model. This used to be ~60 lines of assembly: two Promise.all
  // waves, an .in(visibleIds) guard, a conditional profiles lookup for the
  // marker's name and three Map/Set joins — none of it reachable by a test.
  const [register, rateMap, studentLeavePending, employeeLeavePending] = await Promise.all([
    studentRegister(supabase, {
      classSection,
      date,
      viewerId: userId,
      shiftSelection,
      showYear,
      academicYearSelection,
    }),
    // Attendance Rate (YTD, CONTEXT.md). Null while migration 0214 is
    // unapplied — the column and the card then hide rather than show zeros.
    studentAttendanceRates(supabase),
    // Pending leave workflow card: a head-only count, so PostgREST's 1,000-row
    // cap never enters into it (map 013, new_ui/03-academics/attendance).
    supabase
      .from('student_leaves')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then((r) => r.count ?? 0),
    supabase
      .from('employee_leaves')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then((r) => r.count ?? 0),
  ])

  const fmt = numberFmt(lang)
  const n = (x: number) => fmt.format(x)
  const total = register.rows.length
  const taken = Boolean(register.markedBy)
  const present = register.rows.filter((r) => r.present).length
  const rates = rateMap
    ? Object.fromEntries(register.rows.map((r) => [r.id, rateMap.get(r.id)?.rate ?? null]))
    : null
  // Student-day weighted over the register on screen, same as the school figure.
  const ytd = rateMap
    ? register.rows.reduce(
        (acc, r) => {
          const x = rateMap.get(r.id)
          return x ? { p: acc.p + x.present, d: acc.d + x.schoolDays } : acc
        },
        { p: 0, d: 0 },
      )
    : null
  const ytdRate = ytd && ytd.d > 0 ? attendanceRate(ytd.p, ytd.d) : null

  // Classes not marked for `date`, across every Class this caller can read —
  // independent of the classSection filter above, so the banner and workflow
  // card always describe the whole school, not just the row currently shown.
  // A person is "marked" by either table (0170's own contract), same as the
  // single-class register above; `register.readable` is unfiltered by
  // classSection, so this covers every class regardless of the picker.
  const readableIds = register.readable.map((s) => s.id)
  const [{ rows: dayRecords }, { rows: dayNotes }] = readableIds.length
    ? await Promise.all([
        selectAllRows<{ person_id: string }>((from, to) =>
          supabase
            .from('attendance_records')
            .select('person_id')
            .eq('person_type', 'student')
            .eq('att_date', date)
            .in('person_id', readableIds)
            .order('person_id')
            .range(from, to),
        ),
        selectAllRows<{ person_id: string }>((from, to) =>
          supabase
            .from('attendance_absence_notes')
            .select('person_id')
            .eq('person_type', 'student')
            .eq('att_date', date)
            .in('person_id', readableIds)
            .order('person_id')
            .range(from, to),
        ),
      ])
    : [{ rows: [] as { person_id: string }[] }, { rows: [] as { person_id: string }[] }]
  const markedTodaySet = new Set([...dayRecords, ...dayNotes].map((r) => r.person_id))
  const unmarkedIds = unmarkedOfferings(
    register.readable.map((s) => ({ id: s.id, offeringId: s.class_offering_id })),
    markedTodaySet,
  )
  const comboLabel = new Map(register.combos.map((c) => [c.value, c.label]))
  const unmarkedNames = unmarkedIds.map((id) => comboLabel.get(id) ?? id)

  // Banner: the single most urgent stalled item, one line, one way out.
  const banner = unmarkedIds.length
    ? {
        text: `${t('attendance.classesNotMarked', lang)}: ${unmarkedNames.slice(0, 3).join(', ')}${
          unmarkedIds.length > 3 ? ` +${n(unmarkedIds.length - 3)}` : ''
        }`,
        href: `/school/attendance/mark?date=${date}`,
      }
    : null
  const pendingLeaveTotal = studentLeavePending + employeeLeavePending

  return (
    <div>
      <PageHeader
        title={t('attendance.markTitle', lang)}
        subtitle={t('attendance.pageSubtitle', lang)}
        badge={`${n(register.readable.length)} ${t('attendance.studentsTotal', lang)}`}
        crumbs={schoolCrumbs('/school/attendance', lang, { label: t('attendance.title', lang) })}
        actions={
          <Link
            href="/school/attendance/book"
            className="inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('attendance.tabBook', lang)}
          </Link>
        }
      />

      {banner && (
        <WarningBanner
          label={t('attendance.bannerWarn', lang)}
          text={banner.text}
          href={banner.href}
          linkLabel={t('attendance.viewUnmarkedList', lang)}
        />
      )}

      {total > 0 && (
        <StatGrid>
          <StatCard icon={<Users className="size-5" />} label={t('attendance.statTotal', lang)} value={fmt.format(total)} />
          <StatCard
            icon={<UserCheck className="size-5" />}
            tone={taken ? 'mint' : 'muted'}
            label={t('attendance.statPresent', lang)}
            value={taken ? fmt.format(present) : '—'}
            note={taken ? `${fmt.format(attendanceRate(present, total))}%` : t('attendance.notTaken', lang)}
          />
          <StatCard
            icon={<UserX className="size-5" />}
            tone={taken ? 'alert' : 'muted'}
            label={t('attendance.statAbsent', lang)}
            value={taken ? fmt.format(total - present) : '—'}
          />
          {ytdRate != null && (
            <StatCard
              icon={<TrendingUp className="size-5" />}
              tone={ytdRate >= 90 ? 'mint' : ytdRate >= 75 ? 'sun' : 'alert'}
              label={t('attendance.statRateYtd', lang)}
              value={`${fmt.format(ytdRate)}%`}
              action={{ href: '/school/attendance/student-log', label: t('attendance.tabStudentLog', lang) }}
            />
          )}
        </StatGrid>
      )}

      <QuickActions
        title={t('dash.quickActions', lang)}
        actions={[
          { href: '/school/attendance/book', label: t('attendance.tabBook', lang), icon: <BookOpen className="size-4" /> },
          {
            href: '/school/attendance/student-log',
            label: t('attendance.tabStudentLog', lang),
            icon: <ClipboardList className="size-4" />,
          },
          {
            href: '/school/attendance/leave/student',
            label: t('attendance.studentLeaveTitle', lang),
            icon: <CalendarOff className="size-4" />,
          },
          { href: '/school/attendance/employee', label: t('attendance.tabEmployee', lang), icon: <UserCheck className="size-4" /> },
        ]}
      />

      <AttendanceTabs active="/school/attendance/mark" lang={lang} />

      <Form className="mb-grid grid gap-3 rounded-2xl border border-line bg-paper p-card sm:grid-cols-4" action="/school/attendance/mark">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.classSection', lang)}</label>
          <ClassSectionSelect
            combos={register.combos}
            value={classSection}
            ariaLabel={t('attendance.classSection', lang)}
            allLabel={t('attendance.allClasses', lang)}
            fullWidth
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.date', lang)}</label>
          <input type="date" name="date" defaultValue={date} className={dateInputClass({ fullWidth: true })} />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('classes.filter', lang)}
          </button>
        </div>
      </Form>

      {/* An empty register says which kind of empty it is: a teacher with no
          class attachment is not told her school has no students (#538). */}
      {register.empty ? (
        <EmptyState
          title={t(EMPTY_TITLE[register.empty], lang)}
          body={register.empty === 'unassigned' ? t('students.noClassAssignedHelp', lang) : undefined}
          action={{
            href: EMPTY_ACTION[register.empty].href,
            label: t(EMPTY_ACTION[register.empty].label, lang),
          }}
          lang={lang}
        />
      ) : (
        <MarkAttendanceForm
          key={`${classSection}-${date}`}
          lang={lang}
          date={date}
          students={register.rows}
          markedBy={register.markedBy}
          rates={rates}
        />
      )}

      <div className="mt-section grid gap-grid lg:grid-cols-2">
        <WorkflowCard
          icon={<CalendarClock className="size-5" />}
          title={t('attendance.classesNotMarked', lang)}
          tag={unmarkedIds.length ? t('attendance.pendingTag', lang) : undefined}
        >
          {unmarkedIds.length ? (
            <ul className="mb-4 divide-y divide-line">
              {unmarkedIds.slice(0, 5).map((id) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="truncate font-semibold">{comboLabel.get(id) ?? id}</p>
                  <RowActionPill
                    state="next"
                    href={`/school/attendance/mark?classSection=${id}&date=${date}`}
                    label={t('attendance.tabMark', lang)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mb-4 text-center">
              <span
                className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600"
                aria-hidden
              >
                <CalendarClock className="size-6" />
              </span>
              <p className="font-bold">{t('attendance.notMarkedEmpty', lang)}</p>
            </div>
          )}
        </WorkflowCard>

        <WorkflowCard
          icon={<CalendarOff className="size-5" />}
          title={t('attendance.leaveWorkflowTitle', lang)}
          tag={pendingLeaveTotal ? t('attendance.leaveWorkflowTag', lang) : undefined}
        >
          {pendingLeaveTotal ? (
            <ul className="mb-4 divide-y divide-line">
              {studentLeavePending > 0 && (
                <li className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="font-semibold">
                    {t('attendance.studentLeavesPendingLabel', lang)}: {n(studentLeavePending)}
                  </p>
                  <RowActionPill
                    state="next"
                    href="/school/attendance/leave/student?status=pending"
                    label={t('attendance.reviewAction', lang)}
                  />
                </li>
              )}
              {employeeLeavePending > 0 && (
                <li className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="font-semibold">
                    {t('attendance.employeeLeavesPendingLabel', lang)}: {n(employeeLeavePending)}
                  </p>
                  <RowActionPill
                    state="next"
                    href="/school/attendance/leave/employee?status=pending"
                    label={t('attendance.reviewAction', lang)}
                  />
                </li>
              )}
            </ul>
          ) : (
            <div className="mb-4 text-center">
              <span
                className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600"
                aria-hidden
              >
                <CalendarOff className="size-6" />
              </span>
              <p className="font-bold">{t('attendance.leaveWorkflowEmpty', lang)}</p>
            </div>
          )}
        </WorkflowCard>
      </div>
    </div>
  )
}
