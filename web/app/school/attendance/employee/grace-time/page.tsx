import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { exemptionCategoriesByExemptionId } from '@/lib/school/ad-hoc-grace'
import { officeHourShiftOptions, resolveActiveShift } from '@/lib/office-hours'
import { ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'
import { EMPLOYEE_CATEGORIES, EMPLOYEE_CATEGORY_LABEL_KEY } from '@/lib/employees'
import { GRACE_DETAIL_LABEL_KEY, isGraceDetail } from '@/lib/grace'
import { AttendanceTabs } from '../../attendance-tabs'
import { AddStandingRuleForm, AddAdHocExemptionForm, DeleteGraceEntryButton } from './grace-time-controls'
import { dateInputClass, filterButtonClass } from '@/components/ui/field'

// Grace Time (issue #671, redesigned by #673 / ADR 0032). Two sections:
// Standing Grace Rules (Grace Detail + Categories + minutes, one per Shift +
// Grace Detail) and dated Ad-Hoc Grace Exemptions. Each section has its own
// local Shift filter over the School's raw configured_shifts, the same
// pattern as Office Hour — never the topbar's Global Shift Selection. Shift
// is display-only: it organises rows, never narrows who a rule applies to.

const EXEMPTION_LIST_LIMIT = 200
const PAGE = '/school/attendance/employee/grace-time'
const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'

interface StandingRuleRow {
  id: string
  grace_detail: string
  grace_minutes: number
  standing_grace_rule_categories: { category: string }[]
}

interface AdHocExemptionRow {
  id: string
  exemption_date: string
  details: string | null
  duration_minutes: number
}

function categoryLabel(c: string, lang: Lang): string {
  // Legacy values outside the fixed list (see CONTEXT.md, Employee Category) show as stored.
  const key = (EMPLOYEE_CATEGORY_LABEL_KEY as Record<string, MessageKey | undefined>)[c]
  return key ? t(key, lang) : c
}

/** Every fixed Category selected reads as "All Categories" rather than a
 *  20-item list. */
function categoriesCell(categories: readonly string[], lang: Lang): string {
  if (EMPLOYEE_CATEGORIES.every((c) => categories.includes(c))) return t('employees.allCategories', lang)
  return categories.map((c) => categoryLabel(c, lang)).join(', ') || '—'
}

function pageHref(params: Record<string, string | null>): string {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]))
  const s = qs.toString()
  return s ? `${PAGE}?${s}` : PAGE
}

function ShiftFilter({
  shiftOptions,
  active,
  hrefFor,
  lang,
}: {
  shiftOptions: readonly AcademicShift[]
  active: string | null
  hrefFor: (shift: string) => string
  lang: Lang
}) {
  if (!shiftOptions.length) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted">{t('officeHour.shift', lang)}:</span>
      {shiftOptions.map((s) => (
        <Link
          key={s}
          href={hrefFor(s)}
          scroll={false}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            s === active ? 'bg-brand-500 text-white' : 'border border-line-strong text-muted hover:bg-paper-muted'
          }`}
        >
          {t(ACADEMIC_SHIFT_LABEL_KEY[s], lang)}
        </Link>
      ))}
    </div>
  )
}

export default async function GraceTimePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; shift?: string; adHocShift?: string }>
}) {
  const { from = '', to = '', shift: requestedShift, adHocShift: requestedAdHocShift } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, configuredShifts } = await getSchoolContext()

  const shiftOptions = officeHourShiftOptions(configuredShifts)
  const activeShift = resolveActiveShift(shiftOptions, requestedShift ?? null)
  const activeAdHocShift = resolveActiveShift(shiftOptions, requestedAdHocShift ?? null)

  const ruleBase = supabase
    .from('standing_grace_rules')
    .select('id, grace_detail, grace_minutes, standing_grace_rule_categories(category)')
    .order('grace_detail')
  let exemptionQuery = supabase
    .from('ad_hoc_grace_exemptions')
    .select('id, exemption_date, details, duration_minutes')
    .order('exemption_date', { ascending: false })
    .limit(EXEMPTION_LIST_LIMIT)
  exemptionQuery = activeAdHocShift ? exemptionQuery.eq('shift', activeAdHocShift) : exemptionQuery.is('shift', null)
  if (from) exemptionQuery = exemptionQuery.gte('exemption_date', from)
  if (to) exemptionQuery = exemptionQuery.lte('exemption_date', to)

  const [{ data: rules }, { data: exemptions }] = await Promise.all([
    activeShift ? ruleBase.eq('shift', activeShift) : ruleBase.is('shift', null),
    exemptionQuery,
  ])

  const categoriesByExemption = await exemptionCategoriesByExemptionId(
    supabase,
    (exemptions ?? []).map((ex) => ex.id),
  )

  const ruleRows = (rules ?? []) as StandingRuleRow[]
  const exemptionRows: AdHocExemptionRow[] = exemptions ?? []
  const current = { shift: activeShift, adHocShift: activeAdHocShift, from: from || null, to: to || null }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.tabGraceTime', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AttendanceTabs active="/school/attendance/employee/grace-time" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="mb-1 font-bold">{t('graceTime.standingTitle', lang)}</h3>
            <p className="text-xs text-muted">{t('graceTime.hint', lang)}</p>
          </div>
          <AddStandingRuleForm lang={lang} shiftOptions={shiftOptions} activeShift={activeShift} />
        </div>

        <ShiftFilter
          shiftOptions={shiftOptions}
          active={activeShift}
          hrefFor={(s) => pageHref({ ...current, shift: s })}
          lang={lang}
        />

        {!ruleRows.length ? (
          <p className="text-sm text-muted">{t('graceTime.noRules', lang)}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={th}>{t('graceTime.categoryDetailsCol', lang)}</th>
                  <th className={th}>{t('graceTime.exemptionCategories', lang)}</th>
                  <th className={th}>{t('graceTime.graceTimeCol', lang)}</th>
                  <th className={th}>{t('graceTime.actionsCol', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {ruleRows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-sm font-medium">
                      {isGraceDetail(r.grace_detail) ? t(GRACE_DETAIL_LABEL_KEY[r.grace_detail], lang) : r.grace_detail}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {categoriesCell(r.standing_grace_rule_categories.map((c) => c.category), lang)}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {r.grace_minutes} {t('attendance.graceMinutesSuffix', lang)}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <DeleteGraceEntryButton id={r.id} kind="standing" lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h3 className="mb-1 font-bold">{t('graceTime.adHocTitle', lang)}</h3>
        <p className="mb-3 text-xs text-muted">{t('graceTime.adHocHint', lang)}</p>

        <div className="mb-4 rounded-lg border border-line bg-paper-muted p-4">
          <AddAdHocExemptionForm lang={lang} shiftOptions={shiftOptions} activeShift={activeAdHocShift} />
        </div>

        <ShiftFilter
          shiftOptions={shiftOptions}
          active={activeAdHocShift}
          hrefFor={(s) => pageHref({ ...current, adHocShift: s })}
          lang={lang}
        />

        <Form className="mb-4 flex flex-wrap items-end gap-2" action={PAGE} scroll={false}>
          {activeShift && <input type="hidden" name="shift" value={activeShift} />}
          {activeAdHocShift && <input type="hidden" name="adHocShift" value={activeAdHocShift} />}
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
            className={filterButtonClass()}
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
                  <th className={th}>{t('graceTime.exemptionDate', lang)}</th>
                  <th className={th}>{t('graceTime.exemptionDuration', lang)}</th>
                  <th className={th}>{t('graceTime.exemptionCategories', lang)}</th>
                  <th className={th}>{t('graceTime.exemptionDetails', lang)}</th>
                  <th className={th}>{t('graceTime.actionsCol', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {exemptionRows.map((ex) => (
                  <tr key={ex.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-sm">{ex.exemption_date}</td>
                    <td className="px-3 py-2 text-sm">
                      {ex.duration_minutes} {t('attendance.graceMinutesSuffix', lang)}
                    </td>
                    <td className="px-3 py-2 text-sm">{categoriesCell(categoriesByExemption.get(ex.id) ?? [], lang)}</td>
                    <td className="px-3 py-2 text-sm">{ex.details ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2 text-sm">
                      <DeleteGraceEntryButton id={ex.id} kind="adHoc" lang={lang} />
                    </td>
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
