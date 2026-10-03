import Form from 'next/form'
import { AlertTriangle, Layers, Send } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, formatDateTime, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs, rowAction } from '@/lib/school-crumbs'
import { selectAllRows } from '@/lib/supabase/select-all'
import { SmsTabs } from '../tabs'
import { aggregateSmsLog, summarizeSmsLog, type SmsLogBatch, type SmsLogRow } from '@/lib/sms/log'
import { dateInputClass } from '@/components/ui/field'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'

// Send Log (issue #36, PRD §5.7 "send summary/log with date-range totals"),
// map 013 FC2: range totals as stat cards, then one DataTable row per send
// (search, Status filter + chip) with a drawer for the full message. sms_log
// holds one row per recipient for BOTH manual composes and the automated
// absence-rule cron (0021/0047); this groups rows by batch_id back into one
// row per send action and totals both kinds together.

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

const PAGE_SIZE = 20

export default async function SmsLogPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; q?: string; status?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { start, end, q = '', status = '', page, size, view } = params
  const lang: Lang = await currentLang()
  const fmt = numberFmt(lang)
  const { supabase } = await getSchoolContext()

  const today = new Date().toISOString().slice(0, 10)
  const rangeStart = start || daysAgoIso(6)
  const rangeEnd = end || today

  // One row per recipient, so a week easily passes PostgREST's 1000-row cap.
  const { rows } = await selectAllRows<SmsLogRow>((from, to) =>
    supabase
      .from('sms_log')
      .select('id, batch_id, kind, recipient_label, body, segments, status, created_at')
      .gte('sent_on', rangeStart)
      .lte('sent_on', rangeEnd)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  const batches = aggregateSmsLog(rows)
  const totals = summarizeSmsLog(rows)

  const groupLabel = (b: SmsLogBatch) =>
    b.kind === 'absence_auto' ? t('sms.logAutoGroup', lang) : (b.recipientLabel ?? t('sms.modeManual', lang))
  const needle = q.toLowerCase()
  const shown = batches.filter(
    (b) =>
      (!status || (status === 'failed') === b.failed) &&
      (!needle || b.bodyPreview.toLowerCase().includes(needle) || groupLabel(b).toLowerCase().includes(needle)),
  )
  const pageData = paginate(shown, page, pageSizeFrom(size, PAGE_SIZE))
  const viewed = view ? (batches.find((b) => b.batchId === view) ?? null) : null
  const when = (b: SmsLogBatch) => formatDateTime(b.sentAt, lang)
  const statusPill = (b: SmsLogBatch) => (
    <Pill tone={b.failed ? 'alert' : 'mint'}>{b.failed ? t('sms.failed', lang) : t('sms.statusSent', lang)}</Pill>
  )

  const columns: Column<SmsLogBatch>[] = [
    { key: 'group', header: t('sms.recipientGroup', lang), card: 'title', cell: (b) => <span className="font-semibold">{groupLabel(b)}</span> },
    { key: 'status', header: t('sms.status', lang), card: 'badge', cell: statusPill },
    { key: 'when', header: t('sms.dateTime', lang), cell: when },
    { key: 'recipients', header: t('sms.recipients', lang), align: 'right', cell: (b) => fmt.format(b.recipients) },
    {
      key: 'body',
      header: t('sms.body', lang),
      card: 'hidden',
      className: 'max-w-xs truncate text-muted',
      cell: (b) => b.bodyPreview,
    },
    { key: 'segments', header: t('sms.segmentsCol', lang), align: 'right', cell: (b) => fmt.format(b.segments) },
  ]

  return (
    <>
      <PageHeader
        title={t('sms.log', lang)}
        crumbs={schoolCrumbs('/school/sms/log', lang, [
          { label: t('sms.centerTitle', lang), href: '/school/sms' },
          { label: t('sms.log', lang) },
        ])}
        badge={`${t('pager.total', lang)}: ${fmt.format(batches.length)}`}
      />

      <SmsTabs active="/school/sms/log" lang={lang} />

      <Form className="mb-grid flex flex-wrap items-center gap-2" action="/school/sms/log">
        <input type="date" name="start" defaultValue={rangeStart} aria-label={t('vouchers.from', lang)} className={dateInputClass()} />
        <input type="date" name="end" defaultValue={rangeEnd} aria-label={t('vouchers.to', lang)} className={dateInputClass()} />
        <button type="submit" className={rowAction}>
          {t('sms.apply', lang)}
        </button>
      </Form>

      <StatGrid>
        <StatCard icon={<Send className="size-5" />} label={t('sms.totalSent', lang)} value={fmt.format(totals.totalSent)} />
        <StatCard icon={<Layers className="size-5" />} tone="sky" label={t('sms.totalSegments', lang)} value={fmt.format(totals.totalSegments)} />
        <StatCard
          icon={<AlertTriangle className="size-5" />}
          tone="alert"
          label={t('sms.failed', lang)}
          value={fmt.format(totals.totalFailed)}
        />
      </StatGrid>

      <DataTable
        rows={pageData.items}
        rowId={(b) => b.batchId}
        rowLabel={groupLabel}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('sms.log', lang)}
        search={{ placeholder: t('sms.searchLog', lang) }}
        filters={[
          {
            param: 'status',
            label: t('sms.status', lang),
            options: [
              { value: 'sent', label: t('sms.statusSent', lang) },
              { value: 'failed', label: t('sms.failed', lang) },
            ],
          },
        ]}
        chips={[{ param: 'status', value: 'failed', label: t('sms.failed', lang) }]}
        rowActions={(b) => <ViewLink id={b.batchId} params={params} label={t('sms.viewMessage', lang)} name={groupLabel(b)} />}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize: pageSizeFrom(size, PAGE_SIZE) }}
        empty={
          <Card>
            <p className="text-sm text-muted">{t('sms.noLogRows', lang)}</p>
          </Card>
        }
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed ? groupLabel(viewed) : ''}
        subtitle={viewed ? when(viewed) : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {statusPill(viewed)}
              <span className="text-muted">
                {t('sms.recipients', lang)}: {fmt.format(viewed.recipients)} · {t('sms.segmentsCol', lang)}:{' '}
                {fmt.format(viewed.segments)}
              </span>
            </div>
            <Card>
              <p className="whitespace-pre-wrap text-sm">{viewed.bodyPreview}</p>
            </Card>
          </div>
        )}
      </RecordDrawer>
    </>
  )
}
