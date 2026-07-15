import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { takaInWords } from '@/lib/amount-words'
import { totalPayable } from '@/lib/fees'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { PrintButton } from './print-button'

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

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
  const school = record.schools as unknown as { name: string } | null
  // Adjustment is a discount/scholarship — it reduces what was actually collected.
  // Shared with the collection form's live preview (lib/fees.ts).
  const total = totalPayable(Number(record.pay_amount), Number(record.fine_amount), Number(record.adjust_amount))

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/school/fees" aria-label={t('fees.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <PrintButton label={t('fees.print', lang)} />
      </div>

      <section className="rounded-lg border border-line bg-paper p-6 shadow-card print:border-0 print:shadow-none">
        <header className="mb-4 border-b border-line pb-3 text-center">
          <h1 className="text-lg font-extrabold">{school?.name}</h1>
          <p className="text-xs uppercase tracking-wide text-muted">{t('fees.receipt', lang)}</p>
        </header>

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
              {record.month}/{record.year}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.receivedAmount', lang)}</dt>
            <dd>৳{Number(record.pay_amount).toFixed(2)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.fine', lang)}</dt>
            <dd>৳{Number(record.fine_amount).toFixed(2)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.adjust', lang)}</dt>
            <dd>৳{Number(record.adjust_amount).toFixed(2)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('fees.due', lang)}</dt>
            <dd>৳{Number(record.due_amount).toFixed(2)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-bold">
            <dt>{t('fees.total', lang)}</dt>
            <dd>৳{total.toFixed(2)}</dd>
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

        <footer className="mt-6 text-center text-xs text-muted">
          {t('fees.method', lang)}: {t(`fees.${record.payment_method}` as 'fees.cash', lang)} ·{' '}
          {new Date(record.updated_at).toLocaleDateString()}
        </footer>
      </section>
    </main>
  )
}
