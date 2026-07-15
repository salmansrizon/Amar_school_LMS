import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { filterRoster, studentClassOptions, studentSectionOptions } from '@/lib/attendance-manual'
import { AttendanceTabs } from '../attendance-tabs'
import { MarkAttendanceForm } from './mark-form'

// Layout per ui/school-owner/attendance-student-mark.html: class/section/
// shift/date filters, bulk all-present/all-absent, per-row present/absent +
// absence cause, Roll number leading each row (roll_number/shift_id landed
// with #27's admission profile, merged after this ticket first shipped).
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function MarkAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; section?: string; shift?: string; date?: string }>
}) {
  const { class: className = '', section = '', shift = '', date = todayIso() } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: students }, { data: shifts }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, class_name, section, roll_number, shift_id')
      .order('full_name'),
    supabase.from('shifts').select('id, name').order('created_at'),
  ])
  const roster = students ?? []
  const shiftOptions = shifts ?? []
  const classes = studentClassOptions(roster)
  const sections = className ? studentSectionOptions(roster, className) : []
  const visible = filterRoster(roster, className, section, shift)
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
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.markTitle', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AttendanceTabs active="/school/attendance/mark" lang={lang} />

      <form className="mb-4 grid gap-3 rounded-lg border border-line bg-paper p-5 shadow-card sm:grid-cols-5" method="get">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.class', lang)}</label>
          <select
            name="class"
            defaultValue={className}
            className="w-full rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          >
            <option value="">{t('attendance.allClasses', lang)}</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.section', lang)}</label>
          <select
            name="section"
            defaultValue={section}
            className="w-full rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          >
            <option value="">{t('attendance.allSections', lang)}</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.shift', lang)}</label>
          <select
            name="shift"
            defaultValue={shift}
            className="w-full rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          >
            <option value="">{t('attendance.allShifts', lang)}</option>
            {shiftOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.date', lang)}</label>
          <input type="date" name="date" defaultValue={date} className="w-full rounded-md border border-line bg-paper px-3 py-1.5 text-sm" />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('classes.filter', lang)}
          </button>
        </div>
      </form>

      {!visible.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('attendance.none', lang)}
        </p>
      ) : (
        <MarkAttendanceForm lang={lang} date={date} students={initial} />
      )}
    </main>
  )
}
