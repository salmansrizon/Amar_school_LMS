import { CircleCheck, ReceiptText, TriangleAlert, Wallet } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, formatMoney, formatNumber } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { sortFees, totalFees, monthLabel, payableOf, type FeeRecord } from '@/lib/student/fees'
import { feeStatus, isFeeOverdue } from '@/lib/student/dashboard'
import { schoolToday } from '@/lib/school-time'
import { PrintTrigger } from '@/components/print/print-trigger'
import { pageTitle } from '@/lib/page-title'
import { PageHeader } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/states'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { NoMatch } from '@/components/student/no-match'
import { matchesQ, pageOf } from '@/lib/student/table'
import { StatCard, StatGrid, ToneDot, type WidgetTone } from '@/components/ui/widgets'

// The Student's own fees (#453), bound by ADR 0015.
//
// Paid, fine, due — and never the adjustment, which conflates a scholarship the
// child earned with a hardship waiver the family had to ask for. The column is
// absent from student_fee_record entirely, so there is nothing here to leak.
//
// This is a statement, not a receipt: fee_collection_records keeps one
// cumulative row per Student per month with no per-payment history by design.
export const generateMetadata = pageTitle('student.feesTitle')

export default async function StudentFeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const { data } = await supabase.from('student_fee_record').select('*')
  const records = sortFees((data ?? []) as FeeRecord[])
  const totals = totalFees(records)
  const today = schoolToday()
  // The same tone rule as the home's fee card: a past month unpaid is alert,
  // only this month due is sun, nothing due is mint.
  const status = feeStatus(records, today)

  const dueTone: WidgetTone = status.tone === 'muted' ? 'muted' : status.tone
  const money = (n: number) => formatMoney(n, lang)
  // One pulse for the table: the first past-due month names the state.
  const firstOverdueId = records.find((r) => isFeeOverdue(r, today))?.id

  const years = [...new Set(records.map((r) => r.year))].sort((a, b) => b - a)
  const shown = records.filter(
    (r) =>
      matchesQ(params.q, monthLabel(r.month, r.year, lang)) &&
      (!params.status || (params.status === 'due') === (Number(r.due_amount) > 0)) &&
      (!params.year || String(r.year) === params.year),
  )
  const paged = pageOf(shown, params)

  const columns: Column<FeeRecord>[] = [
    {
      key: 'month',
      header: t('student.month', lang),
      card: 'title',
      cell: (r) => (
        <span className="inline-flex items-center gap-2 font-medium">
          {r.id === firstOverdueId && <ToneDot tone="alert" pulse />}
          {monthLabel(r.month, r.year, lang)}
        </span>
      ),
    },
    { key: 'payable', header: t('student.feePayable', lang), cell: (r) => <span className="font-medium">{money(payableOf(r))}</span> },
    { key: 'paid', header: t('student.feePaid', lang), cell: (r) => money(Number(r.pay_amount)) },
    { key: 'fine', header: t('student.feeFine', lang), cell: (r) => (Number(r.fine_amount) > 0 ? money(Number(r.fine_amount)) : '—') },
    {
      key: 'due',
      header: t('student.feeDue', lang),
      cell: (r) =>
        Number(r.due_amount) > 0 ? (
          <span className={`font-bold ${isFeeOverdue(r, today) ? 'text-alert-deep' : 'text-sun-deep'}`}>{money(Number(r.due_amount))}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: t('student.col.state', lang),
      card: 'badge',
      cell: (r) =>
        Number(r.due_amount) > 0 ? (
          <Pill tone={isFeeOverdue(r, today) ? 'alert' : 'sun'}>{t('student.feeDue', lang)}</Pill>
        ) : (
          <Pill tone="mint">{t('student.feePaid', lang)}</Pill>
        ),
    },
  ]

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        icon="fees"
        title={t('student.feesTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.navGroup.money', lang) }] }}
        badge={status.monthsDue ? `${formatNumber(status.monthsDue, lang)} ${t('student.dash.monthsDue', lang)}` : undefined}
        actions={records.length > 0 && <PrintTrigger href="/student/fees/print" label={t('student.printStatement', lang)} />}
      />

      {!records.length ? (
        <EmptyState
          icon="fees"
          lang={lang}
          title={t('student.noFees', lang)}
          action={{ href: '/student', label: t('student.nav.home', lang) }}
        />
      ) : (
        <>
          {/* Four figures, not three: "paid" alone told a family nothing to
              compare against. Payable is derived from the record itself
              (lib/student/fees.ts), so fee_structures stays shut — ADR 0015. */}
          <StatGrid>
            <StatCard icon={<ReceiptText className="size-5" />} tone="brand" label={t('student.totalPayable', lang)} value={money(totals.payable)} />
            <StatCard
              icon={<CircleCheck className="size-5" />}
              tone="mint"
              label={t('student.feePaid', lang)}
              value={money(totals.paid)}
              progress={totals.payable > 0 ? (totals.paid / totals.payable) * 100 : undefined}
            />
            <StatCard
              icon={<TriangleAlert className="size-5" />}
              tone={totals.fine > 0 ? 'sun' : 'muted'}
              label={t('student.feeFine', lang)}
              value={money(totals.fine)}
            />
            <StatCard
              icon={<Wallet className="size-5" />}
              tone={dueTone}
              label={t('student.totalDue', lang)}
              value={money(totals.due)}
              note={status.monthsDue ? `${formatNumber(status.monthsDue, lang)} ${t('student.dash.monthsDue', lang)}` : t('student.dash.allPaid', lang)}
            />
          </StatGrid>

          <DataTable
            rows={paged.items}
            rowId={(r) => r.id}
            rowLabel={(r) => monthLabel(r.month, r.year, lang)}
            columns={columns}
            lang={lang}
            params={params}
            caption={t('student.feesTitle', lang)}
            search={{ placeholder: t('student.col.searchMonth', lang) }}
            filters={[
              {
                param: 'status',
                label: t('student.col.state', lang),
                options: [
                  { value: 'due', label: t('student.feeDue', lang) },
                  { value: 'paid', label: t('student.feePaid', lang) },
                ],
              },
              ...(years.length > 1
                ? [{ param: 'year', label: t('student.col.year', lang), options: years.map((y) => ({ value: String(y), label: formatNumber(y, lang, { useGrouping: false }) })) }]
                : []),
            ]}
            pagination={{ page: paged.page, totalPages: paged.totalPages, total: paged.total, pageSize: paged.pageSize }}
            empty={<NoMatch lang={lang} />}
          />

          <p className="mt-3 text-xs text-muted">{t('student.statementNote', lang)}</p>
        </>
      )}
    </main>
  )
}
