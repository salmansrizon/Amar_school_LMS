import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { EMPLOYEE_CATEGORIES } from '@/lib/employees'
import {
  OFFICE_HOUR_DAYS,
  officeHourShiftOptions,
  resolveActiveShift,
  groupOfficeHoursByCategory,
  type OfficeHourRow,
} from '@/lib/office-hours'
import { dayLabel } from '@/lib/routine'
import { ACADEMIC_SHIFT_LABEL_KEY } from '@/lib/institute'
import { InstituteTabs } from '../tabs'
import { OfficeHourForm } from './office-hour-form'
import { OfficeHourCell } from './office-hour-cell'

// Office Hour (issue #643, ADR 0026): Employee-Category x Shift x Day
// published schedule matrix. The Shift tab bar here is local to this page and
// reads schools.configured_shifts directly (via getSchoolContext().configuredShifts)
// — it has no relationship with the topbar's Global Shift Selection cookie.

export default async function OfficeHourPage({
  searchParams,
}: {
  searchParams: Promise<{ shift?: string }>
}) {
  const lang: Lang = await currentLang()
  const { supabase, configuredShifts } = await getSchoolContext()
  const { shift: requestedShift } = await searchParams

  const shiftOptions = officeHourShiftOptions(configuredShifts)
  const activeShift = resolveActiveShift(shiftOptions, requestedShift ?? null)

  const base = supabase
    .from('category_office_hours')
    .select('id, employee_category, day_of_week, start_time, end_time')
  const { data: rows } = await (activeShift ? base.eq('shift', activeShift) : base.is('shift', null))

  const grouped = groupOfficeHoursByCategory((rows ?? []) as OfficeHourRow[], EMPLOYEE_CATEGORIES)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('officeHour.title', lang)}</h1>
        <Link
          href="/school"
          aria-label={t('common.back', lang)}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      </div>

      <InstituteTabs active="/school/institute/office-hour" lang={lang} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('officeHour.intro', lang)}</p>
        <OfficeHourForm lang={lang} shiftOptions={shiftOptions} activeShift={activeShift} />
      </div>

      {shiftOptions.length === 0 ? (
        <p className="mb-4 text-sm text-muted">{t('officeHour.noShiftConfigured', lang)}</p>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">{t('officeHour.shift', lang)}:</span>
          {shiftOptions.map((s) => (
            <Link
              key={s}
              href={`/school/institute/office-hour?shift=${s}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                s === activeShift ? 'bg-brand-500 text-white' : 'border border-line-strong text-muted hover:bg-paper-muted'
              }`}
            >
              {t(ACADEMIC_SHIFT_LABEL_KEY[s], lang)}
            </Link>
          ))}
        </div>
      )}

      {!grouped.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted">{t('officeHour.noEntries', lang)}</p>
      ) : (
        <section className="rounded-lg border border-line bg-paper p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 table-fixed border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-line bg-paper-muted p-1.5 text-left font-semibold">
                    {t('officeHour.category', lang)}
                  </th>
                  {OFFICE_HOUR_DAYS.map((d) => (
                    <th key={d} className="border border-line bg-paper-muted p-1.5 font-semibold">
                      {dayLabel(d, lang)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map((row) => (
                  <tr key={row.category}>
                    <td className="border border-line bg-paper-muted p-1.5 font-semibold">{row.category}</td>
                    {OFFICE_HOUR_DAYS.map((d) => {
                      const cell = row.cells.get(d)
                      return (
                        <td key={d} className="border border-line p-1 text-center align-middle">
                          {cell ? (
                            <OfficeHourCell id={cell.id} startTime={cell.start_time} endTime={cell.end_time} lang={lang} />
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
