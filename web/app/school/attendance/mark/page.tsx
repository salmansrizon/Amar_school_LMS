import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { studentRegister } from '@/lib/school/roster-source'
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
  const { supabase, userId, shiftSelection } = await getSchoolContext()

  // One call, one model. This used to be ~60 lines of assembly: two Promise.all
  // waves, an .in(visibleIds) guard, a conditional profiles lookup for the
  // marker's name and three Map/Set joins — none of it reachable by a test.
  const register = await studentRegister(supabase, { classSection, date, viewerId: userId, shiftSelection })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.markTitle', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AttendanceTabs active="/school/attendance/mark" lang={lang} />

      <Form className="mb-4 grid gap-3 rounded-lg border border-line bg-paper p-5 sm:grid-cols-4" action="/school/attendance/mark">
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
        />
      )}
    </div>
  )
}
