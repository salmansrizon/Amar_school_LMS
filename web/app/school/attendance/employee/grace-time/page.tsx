import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { exemptionCategoriesByExemptionId } from '@/lib/school/ad-hoc-grace'
import { AttendanceTabs } from '../../attendance-tabs'
import { DefaultGraceForm, CategoryGraceForm, AddAdHocExemptionForm } from './grace-time-controls'
import { dateInputClass } from '@/components/ui/field'

// Grace Time (issue #671, ADR 0030): the Employees-module grace UI relocated
// here, plus the two new Employee-Category-based levels (Prayer & Tiffin
// Window, Ad-Hoc Grace Exemption) that replaced the retired per-Employee
// Office Time and individual override. Two sections: standing rules (always
// in force), and dated, filterable Ad-Hoc Grace Exemptions.

const EXEMPTION_LIST_LIMIT = 200

interface CategoryGraceRow {
  category: string
  grace_minutes: number
  prayer_tiffin_minutes: number | null
}

interface AdHocExemptionRow {
  id: string
  exemption_date: string
  details: string | null
  duration_minutes: number
}

export default async function GraceTimePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from = '', to = '' } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, schoolId } = await getSchoolContext()

  let exemptionQuery = supabase
    .from('ad_hoc_grace_exemptions')
    .select('id, exemption_date, details, duration_minutes')
    .order('exemption_date', { ascending: false })
    .limit(EXEMPTION_LIST_LIMIT)
  if (from) exemptionQuery = exemptionQuery.gte('exemption_date', from)
  if (to) exemptionQuery = exemptionQuery.lte('exemption_date', to)

  const [{ data: school }, { data: categoryGrace }, { data: exemptions }] = await Promise.all([
    supabase.from('schools').select('default_grace_minutes').eq('id', schoolId).single(),
    supabase.from('category_grace_minutes').select('category, grace_minutes, prayer_tiffin_minutes').order('category'),
    exemptionQuery,
  ])

  const categoriesByExemption = await exemptionCategoriesByExemptionId(
    supabase,
    (exemptions ?? []).map((ex) => ex.id),
  )

  const rows: CategoryGraceRow[] = categoryGrace ?? []
  const exemptionRows: AdHocExemptionRow[] = exemptions ?? []

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.tabGraceTime', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AttendanceTabs active="/school/attendance/employee/grace-time" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h3 className="mb-1 font-bold">{t('graceTime.standingTitle', lang)}</h3>
        <p className="mb-3 text-xs text-muted">{t('graceTime.hint', lang)}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DefaultGraceForm current={school?.default_grace_minutes ?? null} lang={lang} />
          <CategoryGraceForm lang={lang} />
        </div>

        {rows.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('graceTime.categoryTableTitle', lang)}</h4>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line-strong">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('employees.category', lang)}</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('categoryGrace.add', lang)}</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('graceTime.prayerTiffinCol', lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.category} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-sm font-medium">{r.category}</td>
                      <td className="px-3 py-2 text-sm">{r.grace_minutes}</td>
                      <td className="px-3 py-2 text-sm">{r.prayer_tiffin_minutes ?? <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h3 className="mb-1 font-bold">{t('graceTime.adHocTitle', lang)}</h3>
        <p className="mb-3 text-xs text-muted">{t('graceTime.adHocHint', lang)}</p>

        <div className="mb-4 rounded-lg border border-line bg-paper-muted p-4">
          <AddAdHocExemptionForm lang={lang} />
        </div>

        <Form className="mb-4 flex flex-wrap items-end gap-2" action="/school/attendance/employee/grace-time">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">{t('graceTime.filterFrom', lang)}</label>
            <input type="date" name="from" defaultValue={from} className={dateInputClass()} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">{t('graceTime.filterTo', lang)}</label>
            <input type="date" name="to" defaultValue={to} className={dateInputClass()} />
          </div>
          <button
            type="submit"
            className="h-9 cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('classes.filter', lang)}
          </button>
        </Form>

        {!exemptionRows.length ? (
          <p className="text-sm text-muted">{t('graceTime.noExemptions', lang)}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('graceTime.exemptionDate', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('graceTime.exemptionDuration', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('graceTime.exemptionCategories', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('graceTime.exemptionDetails', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {exemptionRows.map((ex) => (
                  <tr key={ex.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-sm">{ex.exemption_date}</td>
                    <td className="px-3 py-2 text-sm">
                      {ex.duration_minutes} {t('attendance.graceMinutesSuffix', lang)}
                    </td>
                    <td className="px-3 py-2 text-sm">{(categoriesByExemption.get(ex.id) ?? []).join(', ') || '—'}</td>
                    <td className="px-3 py-2 text-sm">{ex.details ?? <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
