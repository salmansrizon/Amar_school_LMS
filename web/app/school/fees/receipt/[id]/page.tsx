import Link from 'next/link'
import { notFound } from 'next/navigation'
import { takaInWords } from '@/lib/amount-words'
import { totalPayable, feePeriodLabel, feeGlRefPattern, FEE_GL_ORDER_COLUMN } from '@/lib/fees'
import { currentLang } from '@/lib/i18n-server'
import { t, formatMoney, formatDate, localeOf } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { PrintButton } from './print-button'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import { InstituteHeader } from '@/components/print/pieces'
import { pageTitle } from '@/lib/page-title'

export const generateMetadata = pageTitle('fees.receipt')

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: record } = await supabase
    .from('fee_collection_records')
    .select(
      'id, month, year, pay_amount, fine_amount, adjust_amount, due_amount, payment_method, note, updated_at, students(full_name, class_name, section), schools(name)',
    )
    .eq('id', id)
    .single()
  if (!record) notFound()

  const student = record.students as unknown as {
    full_name: string
    class_name: string | null
    section: string | null
  } | null
  const institute = await loadInstitutePrintHeader(supabase, lang)

  // #531 asks the owner to see the ledger impact without leaving the flow. The
  // posting is made by the fee_gl_post trigger (0097) in the same transaction as
  // the record, under the ref `fee:<record id>:<seq>` — one entry per write,
  // because an edit posts the delta rather than restating the total. Reading it
  // back here is what proves the payment reached the books; the ledger tab shows
  // the same money derived from the source tables instead.
  //
  // A failed read is not "no entry": this ordered by a column gl_entries does
  // not have, the read was rejected, and a paid record's receipt said nothing
  // had reached the books. The error is now its own state.
  const { data: glEntries, error: glError } = await supabase
    .from('gl_entries')
    .select('id, gl_lines(account_code, debit, credit)')
    .like('ref', feeGlRefPattern(id))
    .order(FEE_GL_ORDER_COLUMN)
  const glLines = (glEntries ?? []).flatMap(
    (e) => (e.gl_lines as unknown as { account_code: string; debit: number; credit: number }[]) ?? [],
  )
  // Adjustment is a discount/scholarship — it reduces what was actually collected.
  // Shared with the collection form's live preview (lib/fees.ts).
  const total = totalPayable(Number(record.pay_amount), Number(record.fine_amount), Number(record.adjust_amount))

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/school/fees" aria-label={t('fees.title', lang)} className="inline-flex size-9 max-sm:size-11 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <PrintButton label={t('fees.print', lang)} />
      </div>

      <section className="rounded-lg border border-line bg-paper p-6 shadow-card print:border-0 print:shadow-none">
        <InstituteHeader institute={institute ?? undefined} docTitle={t('fees.receipt', lang)} />

        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.student', lang)}</dt>
            <dd className="font-medium">
              {student?.full_name}
              {student?.class_name ? ` — ${student.class_name}` : ''}
              {student?.section ? ` (${student.section})` : ''}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.month', lang)}</dt>
            <dd>
              {feePeriodLabel(record.month, record.year, localeOf(lang))}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.receivedAmount', lang)}</dt>
            <dd>{formatMoney(Number(record.pay_amount), lang)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.fine', lang)}</dt>
            <dd>{formatMoney(Number(record.fine_amount), lang)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.adjust', lang)}</dt>
            <dd>{formatMoney(Number(record.adjust_amount), lang)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.due', lang)}</dt>
            <dd>{formatMoney(Number(record.due_amount), lang)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-bold">
            <dt>{t('fees.total', lang)}</dt>
            <dd>{formatMoney(total, lang)}</dd>
          </div>
        </dl>

        <p className="mt-4 rounded-md bg-paper-muted px-3 py-2 text-xs">
          <span className="font-semibold text-muted">{t('fees.inWords', lang)}: </span>
          {takaInWords(total)}
        </p>

        {record.note && (
          <p className="mt-2 rounded-md bg-paper-muted px-3 py-2 text-xs">
            <span className="font-semibold text-muted">{t('fees.note', lang)}: </span>
            {record.note}
          </p>
        )}

        <section className="mt-4 rounded-md border border-line px-3 py-2 text-xs print:hidden">
          <h2 className="mb-1 font-semibold">{t('fees.ledgerImpact', lang)}</h2>
          {glError ? (
            <p className="text-alert-deep">{t('fees.ledgerUnavailable', lang)}</p>
          ) : !glLines.length ? (
            <p className="text-muted">{t('fees.ledgerNone', lang)}</p>
          ) : (
            <table className="w-full">
              <tbody>
                {glLines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-0.5">{l.account_code}</td>
                    <td className="py-0.5 text-right">
                      {Number(l.debit) ? `${t('fees.ledgerDebit', lang)} ${formatMoney(Number(l.debit) / 100, lang)}` : ''}
                    </td>
                    <td className="py-0.5 text-right">
                      {Number(l.credit) ? `${t('fees.ledgerCredit', lang)} ${formatMoney(Number(l.credit) / 100, lang)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link href="/school/fees/ledger" className="mt-1 inline-block font-semibold text-brand-600 hover:underline">
            {t('fees.ledgerOpen', lang)}
          </Link>
        </section>

        <footer className="mt-6 text-center text-xs text-muted">
          {t('fees.method', lang)}: {t(`fees.${record.payment_method}` as 'fees.cash', lang)} ·{' '}
          {formatDate(record.updated_at, lang, 'form')}
        </footer>
      </section>
    </main>
  )
}
