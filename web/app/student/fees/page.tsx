import { CircleCheck, ReceiptText, TriangleAlert, Wallet } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, formatMoney, formatNumber } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { sortFees, totalFees, monthLabel, payableOf, type FeeRecord } from '@/lib/student/fees'
import { feeStatus, isFeeOverdue } from '@/lib/student/dashboard'
import { schoolToday } from '@/lib/school-time'
import { PrintTrigger } from '@/components/print/print-trigger'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader, railClass, thClass, tdClass, trClass } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/states'
import { StatCard, StatGrid, type WidgetTone } from '@/components/ui/widgets'

// The Student's own fees (#453), bound by ADR 0015.
//
// Paid, fine, due — and never the adjustment, which conflates a scholarship the
// child earned with a hardship waiver the family had to ask for. The column is
// absent from student_fee_record entirely, so there is nothing here to leak.
//
// This is a statement, not a receipt: fee_collection_records keeps one
// cumulative row per Student per month with no per-payment history by design.
export const generateMetadata = pageTitle('student.feesTitle')

export default async function StudentFeesPage() {
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

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={t('student.feesTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.feesTitle', lang) }] }}
        badge={status.monthsDue ? `${formatNumber(status.monthsDue, lang)} ${t('student.dash.monthsDue', lang)}` : undefined}
        actions={records.length > 0 && <PrintTrigger href="/student/fees/print" label={t('student.printStatement', lang)} />}
      />

      {!records.length ? (
        <EmptyState
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

          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['student.month', 'student.feePayable', 'student.feePaid', 'student.feeFine', 'student.feeDue'].map((key) => (
                      <th key={key} className={thClass}>
                        {t(key as Parameters<typeof t>[0], lang)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const overdue = isFeeOverdue(r, today)
                    const owing = Number(r.due_amount) > 0
                    return (
                      <tr key={r.id} className={trClass}>
                        <td className={`${tdClass} font-medium ${railClass(overdue ? 'alert' : owing ? 'sun' : undefined)}`}>
                          {monthLabel(r.month, r.year, lang)}
                        </td>
                        <td className={`${tdClass} font-medium`}>{money(payableOf(r))}</td>
                        <td className={tdClass}>{money(Number(r.pay_amount))}</td>
                        <td className={tdClass}>{Number(r.fine_amount) > 0 ? money(Number(r.fine_amount)) : '—'}</td>
                        <td className={tdClass}>
                          {owing ? (
                            <span className={`font-bold ${overdue ? 'text-alert-deep' : 'text-sun-deep'}`}>
                              {money(Number(r.due_amount))}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="mt-3 text-xs text-muted">{t('student.statementNote', lang)}</p>
        </>
      )}
    </main>
  )
}
