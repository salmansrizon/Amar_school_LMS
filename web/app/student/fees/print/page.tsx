import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import { sortFees, totalFees, monthLabel, type FeeRecord } from '@/lib/student/fees'
import { classSectionLabel } from '@/lib/students'
import { PrintPage, InstituteHeader, InfoGrid } from '@/components/print/pieces'

// The Student's fee statement, printed browser-native (ADR 0007).
//
// A *statement*, and it says so: fee_collection_records holds one cumulative
// row per month with no per-payment history, so there is no transaction to
// issue a receipt for (ADR 0015).
export default async function StudentFeeStatementPage() {
  const lang = await currentLang()
  const { supabase, student } = await getStudentContext()

  const [{ data }, institute] = await Promise.all([
    supabase.from('student_fee_record').select('*'),
    loadInstitutePrintHeader(supabase, lang),
  ])

  const records = sortFees((data ?? []) as FeeRecord[])
  const totals = totalFees(records)
  const money = (n: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(n)

  return (
    <PrintPage>
      <InstituteHeader institute={institute ?? undefined} docTitle={t('student.feesTitle', lang)} />

      <InfoGrid
        rows={[
          { label: t('students.name', lang), value: student.full_name },
          { label: t('students.studentNo', lang), value: student.student_no ?? '—' },
          {
            label: t('students.classSection', lang),
            value: classSectionLabel(student.class_name, student.section) ?? '—',
          },
          { label: t('students.roll', lang), value: student.roll_number ?? '—' },
        ]}
      />

      <table className="print-keep mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-line px-2 py-1 text-left">{t('student.month', lang)}</th>
            <th className="border border-line px-2 py-1 text-left">{t('student.feePaid', lang)}</th>
            <th className="border border-line px-2 py-1 text-left">{t('student.feeFine', lang)}</th>
            <th className="border border-line px-2 py-1 text-left">{t('student.feeDue', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td className="border border-line px-2 py-1">{monthLabel(r.month, r.year, lang)}</td>
              <td className="border border-line px-2 py-1">{money(Number(r.pay_amount))}</td>
              <td className="border border-line px-2 py-1">{money(Number(r.fine_amount))}</td>
              <td className="border border-line px-2 py-1">{money(Number(r.due_amount))}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="border border-line px-2 py-1">Σ</td>
            <td className="border border-line px-2 py-1">{money(totals.paid)}</td>
            <td className="border border-line px-2 py-1">{money(totals.fine)}</td>
            <td className="border border-line px-2 py-1">{money(totals.due)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 text-xs text-muted">{t('student.statementNote', lang)}</p>
    </PrintPage>
  )
}
