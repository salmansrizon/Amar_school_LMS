import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { CHECKLIST_ITEMS, completedCount, checklistStatus, filterChecklistRange, type ChecklistRow } from '@/lib/institute'
import { InstituteTabs } from '../tabs'
import { ChecklistForm } from './checklist-form'

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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const today = new Date().toISOString().slice(0, 10)
  const rangeStart = start || daysAgoIso(6)
  const rangeEnd = end || today

  const { data: rows } = await supabase
    .from('daily_checklists')
    .select('checklist_date, flag_hoisted, anthem_rendered, assembly_held, classes_started_on_time, premises_cleaned')
    .gte('checklist_date', rangeStart)
    .lte('checklist_date', rangeEnd)

  const todayRow = (rows ?? []).find((r) => r.checklist_date === today) ?? null
  const report = filterChecklistRange((rows ?? []) as ChecklistRow[], rangeStart, rangeEnd)

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('institute.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <InstituteTabs active="/school/institute/checklist" lang={lang} />

      <div className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h3 className="mb-3 font-bold">
          {t('institute.checklistToday', lang)} — {today}
        </h3>
        <ChecklistForm lang={lang} date={today} row={todayRow} />
      </div>

      <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">{t('institute.dateRangeReport', lang)}</h3>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <input type="date" name="start" defaultValue={rangeStart} className={dateInputClass} />
            <input type="date" name="end" defaultValue={rangeEnd} className={dateInputClass} />
            <button
              type="submit"
              className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('institute.apply', lang)}
            </button>
          </form>
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
                  const status = checklistStatus(row)
                  return (
                    <tr key={row.checklist_date} className="border-b border-line">
                      <td className={`${tdClass} font-medium`}>{row.checklist_date}</td>
                      <td className={tdClass}>
                        {completedCount(row)}/{CHECKLIST_ITEMS.length}
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
    </main>
  )
}

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'
const dateInputClass = 'h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
