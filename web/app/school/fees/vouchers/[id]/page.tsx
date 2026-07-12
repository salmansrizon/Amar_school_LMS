import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

/** The vouchers-list.html "View" action target: a read-only detail of one
 *  Voucher, including its attachment (opened via the signed-URL API route)
 *  when present. */
export default async function VoucherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: voucher } = await supabase
    .from('vouchers')
    .select(
      'id, voucher_no, txn_date, description, amount, attachment_name, voucher_categories(name, type)',
    )
    .eq('id', id)
    .single()
  if (!voucher) notFound()

  const category = voucher.voucher_categories as unknown as { name: string; type: string } | null
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/school/fees/vouchers" className="text-sm text-brand-600 hover:underline">
          ← {t('vouchers.title', lang)}
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-6 shadow-card">
        <header className="mb-4 border-b border-line pb-3">
          <h1 className="text-lg font-extrabold">{voucher.voucher_no}</h1>
        </header>
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{t('vouchers.date', lang)}</dt>
            <dd>{new Date(voucher.txn_date).toLocaleDateString(locale)}</dd>
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
            <dd>৳{Number(voucher.amount).toLocaleString()}</dd>
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
    </main>
  )
}
