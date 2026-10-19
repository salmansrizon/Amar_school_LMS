import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, formatMoney, formatDate } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'

/** The vouchers-list.html "View" action target: a read-only detail of one
 *  Voucher, including its attachment (opened via the signed-URL API route)
 *  when present. */
export default async function VoucherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: voucher } = await supabase
    .from('vouchers')
    .select(
      'id, voucher_no, txn_date, description, amount, attachment_name, voucher_categories(name, type)',
    )
    .eq('id', id)
    .single()
  if (!voucher) notFound()

  const category = voucher.voucher_categories as unknown as { name: string; type: string } | null

  return (
    <div>
      <PageHeader
        title={voucher.voucher_no}
        backHref="/school/fees/vouchers"
        backLabel={t('vouchers.title', lang)}
        crumbs={schoolCrumbs('/school/fees', lang, { label: t('vouchers.title', lang), href: '/school/fees/vouchers' }, { label: voucher.voucher_no })}
      />

      <section className="rounded-lg border border-line bg-paper p-6">
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{t('vouchers.date', lang)}</dt>
            <dd>{formatDate(voucher.txn_date, lang)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('vouchers.type', lang)}</dt>
            <dd>{t(category?.type === 'income' ? 'vouchers.income' : 'vouchers.expense', lang)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('vouchers.category', lang)}</dt>
            <dd>{category?.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('vouchers.description', lang)}</dt>
            <dd className="text-right">{voucher.description}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-bold">
            <dt>{t('vouchers.amount', lang)}</dt>
            <dd>{formatMoney(Number(voucher.amount), lang)}</dd>
          </div>
        </dl>

        <div className="mt-4 rounded-md bg-paper-muted px-3 py-2 text-xs">
          <span className="font-semibold text-muted">{t('vouchers.attachment', lang)}: </span>
          {voucher.attachment_name ? (
            <a
              href={`/api/accounting-attachment?kind=voucher&id=${voucher.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline"
            >
              📎 {voucher.attachment_name}
            </a>
          ) : (
            <span className="text-muted">{t('vouchers.none', lang)}</span>
          )}
        </div>
      </section>
    </div>
  )
}
