import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { monthGrid, type OffDay } from '@/lib/attendance-manual'
import { AttendanceTabs } from '../attendance-tabs'
import { AddOffDayForm, DeleteOffDayButton } from './off-day-controls'

// Layout per ui/school-owner/off-day-calendar.html: 12-month grid shading
// off-days (red) and significant days (blue); every Saturday shades as the
// regular weekly off-day without needing a DB row (see monthGrid).
const MONTH_NAMES: { bn: string; en: string }[] = [
  { bn: 'জানুয়ারি', en: 'January' },
  { bn: 'ফেব্রুয়ারি', en: 'February' },
  { bn: 'মার্চ', en: 'March' },
  { bn: 'এপ্রিল', en: 'April' },
  { bn: 'মে', en: 'May' },
  { bn: 'জুন', en: 'June' },
  { bn: 'জুলাই', en: 'July' },
  { bn: 'আগস্ট', en: 'August' },
  { bn: 'সেপ্টেম্বর', en: 'September' },
  { bn: 'অক্টোবর', en: 'October' },
  { bn: 'নভেম্বর', en: 'November' },
  { bn: 'ডিসেম্বর', en: 'December' },
]
const WEEKDAY_LABELS: { bn: string; en: string }[] = [
  { bn: 'রবি', en: 'Su' },
  { bn: 'সোম', en: 'Mo' },
  { bn: 'মঙ্গল', en: 'Tu' },
  { bn: 'বুধ', en: 'We' },
  { bn: 'বৃহঃ', en: 'Th' },
  { bn: 'শুক্র', en: 'Fr' },
  { bn: 'শনি', en: 'Sa' },
]

function currentYear(): number {
  return new Date().getFullYear()
}

export default async function OffDayCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const { year: yearParam } = await searchParams
  const year = Number(yearParam) || currentYear()
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: offDaysRaw } = await supabase
    .from('off_days')
    .select('day, label, is_significant')
    .gte('day', `${year}-01-01`)
    .lte('day', `${year}-12-31`)
    .order('day')
  const offDays: OffDay[] = offDaysRaw ?? []

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">
          {t('attendance.offDayTitle', lang)} — {year}
        </h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <AttendanceTabs active="/school/attendance/off-days" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h3 className="mb-3 font-bold">{t('attendance.offDayAddTitle', lang)}</h3>
        <AddOffDayForm lang={lang} />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-alert" /> {t('attendance.offDayLegendRegular', lang)}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-sky" /> {t('attendance.offDayLegendSignificant', lang)}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MONTH_NAMES.map((name, month) => {
          const grid = monthGrid(year, month, offDays)
          return (
            <div key={month} className="rounded-lg border border-line bg-paper p-3 shadow-card">
              <h4 className="mb-2 text-center text-sm font-bold">{name[lang]}</h4>
              <div className="grid grid-cols-7 gap-0.5 text-xs">
                {WEEKDAY_LABELS.map((w) => (
                  <span key={w.en} className="rounded-sm px-0.5 py-0.5 text-center text-muted">
                    {w[lang]}
                  </span>
                ))}
                {grid.map((cell, i) => (
                  <span
                    key={i}
                    title={cell.label ?? undefined}
                    className={`rounded-sm px-0.5 py-0.5 text-center ${
                      cell.isSignificant
                        ? 'bg-sky-soft font-semibold text-sky-deep'
                        : cell.isOff
                          ? 'bg-alert-soft font-semibold text-alert-deep'
                          : ''
                    }`}
                  >
                    {cell.day ?? ''}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-xs text-muted">{t('attendance.offDaySaturdayNote', lang)}</p>

      <section className="mt-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        {!offDays.length ? (
          <p className="text-sm text-muted">{t('attendance.none', lang)}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {offDays.map((od) => (
              <li key={od.day} className="flex items-center justify-between py-2">
                <span>
                  {od.day}
                  {od.label ? ` — ${od.label}` : ''}
                  {od.is_significant && (
                    <span className="ml-2 rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
                      {t('attendance.offDayLegendSignificant', lang)}
                    </span>
                  )}
                </span>
                <DeleteOffDayButton day={od.day} lang={lang} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
