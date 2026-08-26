import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { sortFees, totalFees, monthLabel, type FeeRecord } from '@/lib/student/fees'
import { PrintTrigger } from '@/components/print/print-trigger'

// The Student's own fees (#453), bound by ADR 0015.
//
// Paid, fine, due — and never the adjustment, which conflates a scholarship the
// child earned with a hardship waiver the family had to ask for. The column is
// absent from student_fee_record entirely, so there is nothing here to leak.
//
// This is a statement, not a receipt: fee_collection_records keeps one
// cumulative row per Student per month with no per-payment history by design.
export default async function StudentFeesPage() {
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const { data } = await supabase.from('student_fee_record').select('*')
  const records = sortFees((data ?? []) as FeeRecord[])
  const totals = totalFees(records)

  const money = (n: number) =>
    new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      maximumFractionDigits: 2,
    }).format(n)

  return (
    <main className="w-full max-w-3xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">{t('student.feesTitle', lang)}</h1>
        {records.length > 0 && (
          <PrintTrigger href="/student/fees/print" label={t('student.printStatement', lang)} />
        )}
      </div>

      {!records.length ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noFees', lang)}
        </p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-line bg-paper p-4">
              <div className="text-xl font-extrabold text-mint-deep">৳{money(totals.paid)}</div>
              <div className="text-xs text-muted">{t('student.feePaid', lang)}</div>
            </div>
            <div className="rounded-lg border border-line bg-paper p-4">
              <div className="text-xl font-extrabold text-sun-deep">৳{money(totals.fine)}</div>
              <div className="text-xs text-muted">{t('student.feeFine', lang)}</div>
            </div>
            <div className="rounded-lg border border-line bg-paper p-4">
              <div
                className={`text-xl font-extrabold ${totals.due > 0 ? 'text-alert-deep' : 'text-muted'}`}
              >
                ৳{money(totals.due)}
              </div>
              <div className="text-xs text-muted">{t('student.totalDue', lang)}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  {['student.month', 'student.feePaid', 'student.feeFine', 'student.feeDue'].map((key) => (
                    <th
                      key={key}
                      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      {t(key as Parameters<typeof t>[0], lang)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-sm font-medium">
                      {monthLabel(r.month, r.year, lang)}
                    </td>
                    <td className="px-3 py-2 text-sm">৳{money(Number(r.pay_amount))}</td>
                    <td className="px-3 py-2 text-sm">
                      {Number(r.fine_amount) > 0 ? `৳${money(Number(r.fine_amount))}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {Number(r.due_amount) > 0 ? (
                        <span className="text-alert-deep">৳{money(Number(r.due_amount))}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted">{t('student.statementNote', lang)}</p>
        </>
      )}
    </main>
  )
}
