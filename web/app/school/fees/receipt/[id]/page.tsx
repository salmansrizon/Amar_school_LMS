import Link from 'next/link'
import { notFound } from 'next/navigation'
import { takaInWords } from '@/lib/amount-words'
import { banglaAmountInWords } from '@/lib/bangla-amount-words'
import {
  receiptTotal,
  feePeriodLabel,
  feeGlRefPattern,
  FEE_GL_ORDER_COLUMN,
  recordFeeAmount,
  advanceAmount,
} from '@/lib/fees'
import { feeColumns, feeSelect } from '@/lib/fee-columns'
import { currentLang } from '@/lib/i18n-server'
import { t, formatMoney, formatDate, localeOf } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { PrintButton } from './print-button'
import { VoidFeeButton } from './void-fee-button'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import { pageTitle } from '@/lib/page-title'
import { PrintDocument } from '@/components/print/document'

export const generateMetadata = pageTitle('fees.receipt')

type ReceiptRecord = {
  id: string
  month: number
  year: number
  pay_amount: number
  fine_amount: number
  adjust_amount: number
  due_amount: number
  /** Migration 0230 (#678); absent before it, null on older rows. */
  fee_amount?: number | null
  payment_method: string
  note: string | null
  updated_at: string
  /** Migration 0231 (#683); absent before it, null on a record that is not voided. */
  void_at?: string | null
  void_by?: string | null
  void_reason?: string | null
  students: unknown
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const { supabase, role } = await getSchoolContext()

  const cols = await feeColumns(supabase)
  const { data } = await supabase
    .from('fee_collection_records')
    .select(
      feeSelect(
        'id, month, year, pay_amount, fine_amount, adjust_amount, due_amount, payment_method, note, updated_at, students(full_name, class_name, section, public_token), schools(name)',
        cols,
        'void_at, void_by, void_reason',
      ),
    )
    .eq('id', id)
    .single()
  if (!data) notFound()
  const record = data as unknown as ReceiptRecord

  const student = record.students as unknown as {
    full_name: string
    class_name: string | null
    section: string | null
    public_token: string
  } | null
  const institute = await loadInstitutePrintHeader(supabase, lang)
  // #683: who voided it — by name where the reader may see that profile.
  const { data: voider } = record.void_by
    ? await supabase.from('profiles').select('full_name').eq('id', record.void_by).maybeSingle()
    : { data: null }
  // School Owner only, and only once migration 0231 gives the void somewhere to be stored.
  const canVoid = cols.void && !record.void_at && role === 'school_owner'

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
  // #707: the total is what was received. The received amount already includes
  // the fine, and the adjustment was never collected, so neither is applied here.
  const total = receiptTotal({ pay_amount: Number(record.pay_amount) })
  // #678: the billed fee, printed only when it is known — stored, or exactly
  // derivable because something is still due. #695: the advance is whatever was
  // received beyond fee + fine − adjustment, known only from a stored fee.
  const figures = {
    pay_amount: Number(record.pay_amount),
    fine_amount: Number(record.fine_amount),
    adjust_amount: Number(record.adjust_amount),
    due_amount: Number(record.due_amount),
    fee_amount: record.fee_amount == null ? null : Number(record.fee_amount),
  }
  const billed = recordFeeAmount(figures)
  const advance = advanceAmount(figures)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/school/fees" aria-label={t('fees.title', lang)} className="inline-flex size-9 max-sm:size-11 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <div className="flex items-center gap-2">
          {canVoid && (
            <VoidFeeButton
              recordId={record.id}
              pay={Number(record.pay_amount)}
              fine={Number(record.fine_amount)}
              lang={lang}
            />
          )}
          <PrintButton label={t('fees.print', lang)} />
        </div>
      </div>

      <PrintDocument lang={lang} institute={institute} docTitle={t('fees.receipt', lang)} verify={{ kind: 'fee_receipt', token: student?.public_token ?? null, refId: record.id }}>
        {/* The receipt keeps its narrow column inside the A4 frame. */}
        <div className="mx-auto w-full max-w-md">

        {/* Not print:hidden — a voided receipt must say so on paper too. */}
        {record.void_at && (
          <div role="alert" className="mb-4 rounded-lg border-2 border-alert bg-alert-soft p-3 text-sm text-alert-deep">
            <p className="text-base font-extrabold uppercase tracking-wide">{t('fees.voided', lang)}</p>
            <p className="mt-1">
              {t('fees.voidedOn', lang)}: {formatDate(record.void_at, lang, 'form')}
              {voider?.full_name ? ` · ${t('fees.voidedBy', lang)}: ${voider.full_name}` : ''}
            </p>
            <p className="mt-1">
              {t('fees.voidReason', lang)}: {record.void_reason}
            </p>
          </div>
        )}

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
          {billed.exact && (
            <div className="flex justify-between">
              <dt className="text-muted">{t('fees.feeAmount', lang)}</dt>
              <dd>{formatMoney(billed.fee, lang)}</dd>
            </div>
          )}
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
          {advance > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">{t('fees.advance', lang)}</dt>
              <dd>{formatMoney(advance, lang)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 font-bold">
            <dt>{t('fees.total', lang)}</dt>
            <dd>{formatMoney(total, lang)}</dd>
          </div>
        </dl>

        <p className="mt-4 rounded-md bg-paper-muted px-3 py-2 text-xs">
          <span className="font-semibold text-muted">{t('fees.inWords', lang)}: </span>
          {lang === 'bn' && Number.isInteger(total) && total <= 999999999 ? banglaAmountInWords(total) : takaInWords(total)}
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
        </div>
      </PrintDocument>
    </main>
  )
}
