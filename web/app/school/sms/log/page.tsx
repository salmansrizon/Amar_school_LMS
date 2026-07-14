import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { SmsTabs } from '../tabs'
import { aggregateSmsLog, summarizeSmsLog, type SmsLogRow } from '@/lib/sms/log'

// Send Log (issue #36, PRD §5.7 "send summary/log with date-range totals")
// per ui/school-owner/sms-log.html. sms_log holds one row per recipient for
// BOTH manual composes and the automated absence-rule cron (0021/0047); this
// groups rows by batch_id back into one row per send action and totals both
// kinds together.

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export default async function SmsLogPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>
}) {
  const { start, end } = await searchParams
  const lang = await currentLang()
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

  const { data } = await supabase
    .from('sms_log')
    .select('id, batch_id, kind, recipient_label, body, segments, status, created_at')
    .gte('sent_on', rangeStart)
    .lte('sent_on', rangeEnd)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as SmsLogRow[]
  const batches = aggregateSmsLog(rows)
  const totals = summarizeSmsLog(rows)

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sms.log', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <SmsTabs active="/school/sms/log" lang={lang} />

      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input type="date" name="start" defaultValue={rangeStart} className={dateInputClass} />
        <input type="date" name="end" defaultValue={rangeEnd} className={dateInputClass} />
        <button
          type="submit"
          className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('sms.apply', lang)}
        </button>
      </form>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('sms.totalSent', lang)}</div>
          <div className="text-2xl font-extrabold">{totals.totalSent}</div>
        </div>
        <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('sms.totalSegments', lang)}</div>
          <div className="text-2xl font-extrabold">{totals.totalSegments}</div>
        </div>
        <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('sms.failed', lang)}</div>
          <div className="text-2xl font-extrabold">{totals.totalFailed}</div>
        </div>
      </div>

      {batches.length === 0 ? (
        <p className="text-sm text-muted">{t('sms.noLogRows', lang)}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-paper shadow-card">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('sms.dateTime', lang)}</th>
                <th className={thClass}>{t('sms.recipientGroup', lang)}</th>
                <th className={thClass}>{t('sms.recipients', lang)}</th>
                <th className={thClass}>{t('sms.body', lang)}</th>
                <th className={thClass}>{t('sms.segmentsCol', lang)}</th>
                <th className={thClass}>{t('sms.status', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.batchId} className="border-b border-line">
                  <td className={tdClass}>{new Date(b.sentAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB')}</td>
                  <td className={tdClass}>
                    {b.kind === 'absence_auto'
                      ? t('sms.logAutoGroup', lang)
                      : (b.recipientLabel ?? t('sms.modeManual', lang))}
                  </td>
                  <td className={tdClass}>{b.recipients}</td>
                  <td className={`${tdClass} max-w-xs truncate text-muted`}>{b.bodyPreview}</td>
                  <td className={tdClass}>{b.segments}</td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        b.failed ? 'bg-red-50 text-red-600' : 'bg-mint-soft text-mint-deep'
                      }`}
                    >
                      {b.failed ? t('sms.failed', lang) : t('sms.statusSent', lang)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'
const dateInputClass = 'h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
