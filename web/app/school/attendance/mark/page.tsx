import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { filterRoster } from '@/lib/attendance-manual'
import { classSectionOptions, parseClassSectionKey } from '@/lib/class-section-options'
import { AttendanceTabs } from '../attendance-tabs'
import { MarkAttendanceForm } from './mark-form'
import { dateInputClass, selectClass } from '@/components/ui/field'

// Layout per ui/school-owner/attendance-student-mark.html: class/section/
// class/section/date filters, bulk all-present/all-absent, per-row
// present/absent + absence cause, Roll number leading each row (roll_number landed
// with #27's admission profile, merged after this ticket first shipped).
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function MarkAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classSection?: string; date?: string }>
}) {
  const { classSection = '', date = todayIso() } = await searchParams
  const { className, section } = parseClassSectionKey(classSection)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ data: students }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, class_name, section, roll_number')
      .order('full_name'),
  ])
  const roster = students ?? []
  const combos = classSectionOptions(roster)
  const visible = filterRoster(roster, className, section)
  const visibleIds = visible.map((s) => s.id)

  const [{ data: records }, { data: notes }] = await Promise.all([
    visibleIds.length
      ? supabase
          .from('attendance_records')
          .select('person_id')
          .eq('person_type', 'student')
          .eq('att_date', date)
          .in('person_id', visibleIds)
      : Promise.resolve({ data: [] as { person_id: string }[] }),
    visibleIds.length
      ? supabase
          .from('attendance_absence_notes')
          .select('person_id, cause')
          .eq('person_type', 'student')
          .eq('att_date', date)
          .in('person_id', visibleIds)
      : Promise.resolve({ data: [] as { person_id: string; cause: string | null }[] }),
  ])

  const presentIds = new Set((records ?? []).map((r) => r.person_id))
  const causeByPerson = new Map((notes ?? []).map((n) => [n.person_id, n.cause ?? '']))
  const initial = visible.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    roll_number: s.roll_number,
    present: presentIds.has(s.id) || !causeByPerson.has(s.id),
    cause: causeByPerson.get(s.id) ?? '',
  }))

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
          <select
            name="classSection"
            defaultValue={classSection}
            className={selectClass({ fullWidth: true })}
          >
            <option value="">{t('attendance.allClasses', lang)}</option>
            {combos.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
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

      {!visible.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted">
          {t('attendance.none', lang)}
        </p>
      ) : (
        <MarkAttendanceForm lang={lang} date={date} students={initial} />
      )}
    </div>
  )
}
