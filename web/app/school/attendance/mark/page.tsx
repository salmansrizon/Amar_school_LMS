import Form from 'next/form'
import Link from 'next/link'
import { BookOpen, CalendarOff, ClipboardList, TrendingUp, UserCheck, UserX, Users } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { studentRegister } from '@/lib/school/roster-source'
import { studentAttendanceRates } from '@/lib/school/attendance-rate-source'
import { attendanceRate } from '@/lib/dashboard'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { QuickActions, StatCard, StatGrid } from '@/components/ui/widgets'
import { AttendanceTabs } from '../attendance-tabs'
import { MarkAttendanceForm } from './mark-form'
import { dateInputClass } from '@/components/ui/field'
import { ClassSectionSelect } from '@/components/ui/class-section-select'
import { EmptyState } from '@/components/ui/states'

// Layout per ui/school-owner/attendance-student-mark.html: class/section/
// class/section/date filters, bulk all-present/all-absent, per-row
// present/absent + absence cause, Roll number leading each row (roll_number landed
// with #27's admission profile, merged after this ticket first shipped).
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
  const [register, rateMap] = await Promise.all([
    studentRegister(supabase, {
      classSection,
      date,
      viewerId: userId,
      shiftSelection,
      showYear,
      academicYearSelection,
    }),
    // Attendance Rate (YTD, CONTEXT.md). Null while migration 0208 is
    // unapplied — the column and the card then hide rather than show zeros.
    studentAttendanceRates(supabase),
  ])

  const fmt = numberFmt(lang)
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

  return (
    <div>
      <PageHeader
        title={t('attendance.markTitle', lang)}
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
    </div>
  )
}
