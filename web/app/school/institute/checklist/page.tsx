import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { completedCount, checklistStatus, filterChecklistRange, type ActivityChecklistItem, type ChecklistRow } from '@/lib/institute'
import { InstituteTabs } from '../tabs'
import { ChecklistForm } from './checklist-form'
import { ChecklistItemsManager } from './checklist-items-manager'
import { dateInputClass } from '@/components/ui/field'
import { railClass, type Tone } from '@/components/ui/page'

// Administrative daily checklist + date-range report (issue #39, PRD §5.11)
// per ui/school-owner/activity-checklist.html.

const STATUS_BADGE: Record<string, string> = {
  complete: 'bg-mint-soft text-mint-deep',
  partial: 'bg-sun-soft text-sun-deep',
  none: 'bg-paper-muted text-muted',
}
const STATUS_KEY: Record<string, 'institute.statusComplete' | 'institute.statusPartial' | 'institute.statusNone'> = {
  complete: 'institute.statusComplete',
  partial: 'institute.statusPartial',
  none: 'institute.statusNone',
}
const STATUS_RAIL: Record<string, Tone> = { complete: 'mint', partial: 'sun', none: 'muted' }

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>
}) {
  const { start, end } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const today = new Date().toISOString().slice(0, 10)
  const rangeStart = start || daysAgoIso(6)
  const rangeEnd = end || today

  const [{ data: itemRows }, { data: rows }] = await Promise.all([
    supabase
      .from('activity_checklist_items')
      .select('id, label_bn, label_en, sort_order')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('daily_checklists')
      .select('checklist_date, ticks')
      .gte('checklist_date', rangeStart)
      .lte('checklist_date', rangeEnd),
  ])

  const items = (itemRows ?? []) as ActivityChecklistItem[]
  const todayRow = (rows ?? []).find((r) => r.checklist_date === today) ?? null
  const report = filterChecklistRange((rows ?? []) as ChecklistRow[], rangeStart, rangeEnd)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('institute.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <InstituteTabs active="/school/institute/checklist" lang={lang} />

      <div className="mb-4 rounded-lg border border-line bg-paper p-5">
        <h3 className="mb-1 font-bold">{t('institute.checklistManageItems', lang)}</h3>
        <p className="mb-4 text-sm text-muted">{t('institute.checklistManageIntro', lang)}</p>
        <ChecklistItemsManager lang={lang} items={items} />
      </div>

      <div className="mb-4 rounded-lg border border-line bg-paper p-5">
        <h3 className="mb-3 font-bold">
          {t('institute.checklistToday', lang)} — {today}
        </h3>
        <ChecklistForm lang={lang} date={today} items={items} ticks={todayRow?.ticks ?? null} />
      </div>

      <div className="rounded-lg border border-line bg-paper p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">{t('institute.dateRangeReport', lang)}</h3>
          <Form className="flex flex-wrap items-center gap-2" action="/school/institute/checklist">
            <input type="date" name="start" defaultValue={rangeStart} className={dateInputClass()} />
            <input type="date" name="end" defaultValue={rangeEnd} className={dateInputClass()} />
            <button
              type="submit"
              className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('institute.apply', lang)}
            </button>
          </Form>
        </div>
        {!report.length ? (
          <p className="text-sm text-muted">{t('institute.noChecklistRows', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('institute.date', lang)}</th>
                  <th className={thClass}>{t('institute.completed', lang)}</th>
                  <th className={thClass}>{t('institute.status', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row) => {
                  const status = checklistStatus(items, row.ticks)
                  return (
                    <tr key={row.checklist_date} className="border-b border-line">
                      <td className={`${tdClass} font-medium ${railClass(STATUS_RAIL[status])}`}>{row.checklist_date}</td>
                      <td className={tdClass}>
                        {completedCount(items, row.ticks)}/{items.length}
                      </td>
                      <td className={tdClass}>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}>
                          {t(STATUS_KEY[status], lang)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'
