import Form from 'next/form'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import {
  filterRoster,
  monthGrid,
  registerDayStatus,
  studentClassOptions,
  studentSectionOptions,
  type OffDay,
} from '@/lib/attendance-manual'
import { PrintPage, InstituteHeader } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'
import { AttendanceTabs } from '../attendance-tabs'

// Layout per ui/school-owner/attendance-book.html: class/section + month
// filter, Filled/Blank toggle, print button, monthly P/A register grid
// (ADR 0007 print seam — same PrintPage/InstituteHeader pieces every other
// printable composes). "Blank" mode is the paper-fallback: same roster/day
// grid, no data, for hand-filling — same spirit as BlankRosterTable (#39)
// but shaped as a day grid instead of a roll/name/present roster.

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthParam(): string {
  return todayIso().slice(0, 7) // YYYY-MM
}

function monthLabel(year: number, month: number, lang: Lang): string {
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

export default async function AttendanceBookPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; section?: string; month?: string; mode?: string }>
}) {
  const {
    class: className = '',
    section = '',
    month: monthParam = currentMonthParam(),
    mode: modeParam = 'filled',
  } = await searchParams
  const mode = modeParam === 'blank' ? 'blank' : 'filled'
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  if (!me?.school_id || (me.role !== 'school_owner' && me.role !== 'staff_user')) redirect('/login')

  const [yearStr, monthStr] = monthParam.split('-')
  const year = Number(yearStr) || new Date().getUTCFullYear()
  const month = (Number(monthStr) || 1) - 1 // 0-indexed
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthStart = `${monthPrefix}-01`
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const monthEnd = `${monthPrefix}-${String(daysInMonth).padStart(2, '0')}`

  const [{ data: school }, { data: students }] = await Promise.all([
    supabase.from('schools').select('name').eq('id', me.school_id).single(),
    supabase.from('students').select('id, full_name, class_name, section, roll_number').order('full_name'),
  ])
  const roster = students ?? []
  const classes = studentClassOptions(roster)
  const sections = className ? studentSectionOptions(roster, className) : []
  const visible = filterRoster(roster, className, section)
  const visibleIds = visible.map((s) => s.id)

  const [{ data: offDaysRaw }, { data: recordsRaw }, { data: leavesRaw }] = await Promise.all([
    supabase.from('off_days').select('day, label, is_significant').gte('day', monthStart).lte('day', monthEnd),
    visibleIds.length
      ? supabase
          .from('attendance_records')
          .select('person_id, att_date')
          .eq('person_type', 'student')
          .gte('att_date', monthStart)
          .lte('att_date', monthEnd)
          .in('person_id', visibleIds)
      : Promise.resolve({ data: [] as { person_id: string; att_date: string }[] }),
    visibleIds.length
      ? supabase
          .from('student_leaves')
          .select('student_id, from_day, to_day')
          .eq('status', 'approved')
          .lte('from_day', monthEnd)
          .gte('to_day', monthStart)
          .in('student_id', visibleIds)
      : Promise.resolve({ data: [] as { student_id: string; from_day: string; to_day: string }[] }),
  ])

  const offDays: OffDay[] = offDaysRaw ?? []
  const grid = monthGrid(year, month, offDays).filter((c) => c.day !== null)
  const today = todayIso()

  const presentSet = new Set((recordsRaw ?? []).map((r) => `${r.person_id}:${r.att_date}`))
  const leavesByStudent = new Map<string, { from: string; to: string }[]>()
  for (const l of leavesRaw ?? []) {
    const list = leavesByStudent.get(l.student_id) ?? []
    list.push({ from: l.from_day, to: l.to_day })
    leavesByStudent.set(l.student_id, list)
  }
  const onApprovedLeave = (studentId: string, iso: string): boolean =>
    (leavesByStudent.get(studentId) ?? []).some((l) => iso >= l.from && iso <= l.to)

  const buildLink = (overrides: Record<string, string>) => {
    const params = new URLSearchParams({ class: className, section, month: monthParam, mode, ...overrides })
    return `/school/attendance/book?${params.toString()}`
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-extrabold">{t('attendance.bookTitle', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <div className="print:hidden">
        <AttendanceTabs active="/school/attendance/book" lang={lang} />
      </div>

      <Form className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden" action="/school/attendance/book">
        <div className="flex flex-wrap items-center gap-2">
          <select
            name="class"
            defaultValue={className}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          >
            <option value="">{t('attendance.allClasses', lang)}</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            name="section"
            defaultValue={section}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          >
            <option value="">{t('attendance.allSections', lang)}</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="month"
            name="month"
            defaultValue={monthParam}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          />
          <input type="hidden" name="mode" value={mode} />
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('classes.filter', lang)}
          </button>
        </div>
        <div className="flex gap-2">
          <Link
            href={buildLink({ mode: 'filled' })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              mode === 'filled' ? 'border-brand-500 bg-brand-500 text-white' : 'border-line hover:bg-paper-muted'
            }`}
          >
            {t('attendance.bookFilled', lang)}
          </Link>
          <Link
            href={buildLink({ mode: 'blank' })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              mode === 'blank' ? 'border-brand-500 bg-brand-500 text-white' : 'border-line hover:bg-paper-muted'
            }`}
          >
            {t('attendance.bookBlank', lang)}
          </Link>
          <PrintButton label={t('print.print', lang)} />
        </div>
      </Form>

      {!visible.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card print:hidden">
          {t('attendance.bookNoRoster', lang)}
        </p>
      ) : (
        <PrintPage>
          <InstituteHeader
            name={school?.name ?? ''}
            docTitle={`${t('attendance.bookRegisterWord', lang)}${className ? ` — ${className}` : ''}${section ? `, ${section}` : ''} — ${monthLabel(year, month, lang)}`}
          />

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs whitespace-nowrap">
              <thead>
                <tr>
                  <th className="min-w-30 border border-line-strong px-2 py-1 text-left font-semibold">
                    {t('attendance.nameCol', lang)}
                  </th>
                  {grid.map((cell) => (
                    <th key={cell.iso} className="border border-line-strong px-1.5 py-1 text-center font-semibold">
                      {cell.day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td className="border border-line px-2 py-1 text-left">
                      {s.roll_number != null ? `${String(s.roll_number).padStart(2, '0')} ` : ''}
                      {s.full_name}
                    </td>
                    {grid.map((cell) => {
                      if (mode === 'blank') {
                        return <td key={cell.iso} className="border border-line px-1.5 py-1 text-center">&nbsp;</td>
                      }
                      const status = registerDayStatus({
                        iso: cell.iso!,
                        today,
                        isOff: cell.isOff,
                        onApprovedLeave: onApprovedLeave(s.id, cell.iso!),
                        hasRecord: presentSet.has(`${s.id}:${cell.iso}`),
                      })
                      return (
                        <td
                          key={cell.iso}
                          className={`border border-line px-1.5 py-1 text-center ${
                            status === 'absent' ? 'font-semibold text-alert-deep' : ''
                          }`}
                        >
                          {status === 'present' ? 'P' : status === 'absent' ? 'A' : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mode === 'filled' && (
            <p className="mt-3 text-xs text-muted">{t('attendance.bookLegend', lang)}</p>
          )}
        </PrintPage>
      )}
    </main>
  )
}
