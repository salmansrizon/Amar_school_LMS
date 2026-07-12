import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../accounting-tabs'
import { NewVoucherCategoryForm, NewVoucherForm, type CategoryOption } from './voucher-controls'

// Layout per ui/school-owner/vouchers-list.html: toolbar (search + Type +
// date-range filters, "+ New Voucher") over a Voucher No | Date | Type |
// Description | Amount | Attachment | Action table. Category management
// (name + Income/Expense) has no dedicated mockup screen but is required
// plumbing for the Category select below — added as a compact panel above
// the New Voucher form.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; from?: string; to?: string }>
}) {
  const { q = '', type = '', from = '', to = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: categories } = await supabase
    .from('voucher_categories')
    .select('id, name, type')
    .order('name')

  let query = supabase
    .from('vouchers')
    .select(
      'id, voucher_no, txn_date, description, amount, attachment_name, voucher_categories(name, type)',
    )
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (from) query = query.gte('txn_date', from)
  if (to) query = query.lte('txn_date', to)
  const { data: vouchersRaw } = await query

  let vouchers = (vouchersRaw ?? []).map((v) => ({
    ...v,
    category: v.voucher_categories as unknown as { name: string; type: string } | null,
  }))
  if (type) vouchers = vouchers.filter((v) => v.category?.type === type)
  if (q) {
    const needle = q.toLowerCase()
    vouchers = vouchers.filter(
      (v) =>
        v.voucher_no?.toLowerCase().includes(needle) || v.description.toLowerCase().includes(needle),
    )
  }

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('vouchers.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <AccountingTabs active="vouchers" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('vouchers.categoriesTitle', lang)}</h2>
        <NewVoucherCategoryForm lang={lang} />
        {!categories?.length ? (
          <p className="mt-3 text-sm text-muted">{t('vouchers.noCategories', lang)}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  c.type === 'income' ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-muted'
                }`}
              >
                {c.name} · {t(c.type === 'income' ? 'vouchers.income' : 'vouchers.expense', lang)}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('vouchers.newTitle', lang)}</h2>
        {!categories?.length ? (
          <p className="text-sm text-muted">{t('vouchers.noCategories', lang)}</p>
        ) : (
          <NewVoucherForm categories={categories as CategoryOption[]} lang={lang} />
        )}
      </section>

      <section className="overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={q}
            type="text"
            placeholder={t('vouchers.searchPlaceholder', lang)}
            className="h-9 rounded-md border border-line px-3 text-sm"
          />
          <select name="type" defaultValue={type} className="h-9 rounded-md border border-line px-3 text-sm">
            <option value="">{t('vouchers.allTypes', lang)}</option>
            <option value="income">{t('vouchers.income', lang)}</option>
            <option value="expense">{t('vouchers.expense', lang)}</option>
          </select>
          <input name="from" type="date" defaultValue={from} className="h-9 rounded-md border border-line px-3 text-sm" />
          <input name="to" type="date" defaultValue={to} className="h-9 rounded-md border border-line px-3 text-sm" />
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('vouchers.filter', lang)}
          </button>
        </form>

        {!vouchers.length ? (
          <p className="text-sm text-muted">{t('vouchers.noVouchers', lang)}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('vouchers.voucherNo', lang)}</th>
                <th className={thClass}>{t('vouchers.date', lang)}</th>
                <th className={thClass}>{t('vouchers.type', lang)}</th>
                <th className={thClass}>{t('vouchers.description', lang)}</th>
                <th className={thClass}>{t('vouchers.amount', lang)}</th>
                <th className={thClass}>{t('vouchers.attachment', lang)}</th>
                <th className={thClass}>{t('vouchers.action', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} className="border-b border-line">
                  <td className={`${tdClass} font-medium`}>{v.voucher_no}</td>
                  <td className={tdClass}>{new Date(v.txn_date).toLocaleDateString(locale)}</td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        v.category?.type === 'income' ? 'bg-sky-soft text-sky-deep' : 'bg-paper-muted text-muted'
                      }`}
                    >
                      {t(v.category?.type === 'income' ? 'vouchers.income' : 'vouchers.expense', lang)}
                    </span>
                  </td>
                  <td className={tdClass}>{v.description}</td>
                  <td className={tdClass}>৳{Number(v.amount).toLocaleString()}</td>
                  <td className={tdClass}>
                    {v.attachment_name ? (
                      `📎 ${v.attachment_name}`
                    ) : (
                      <span className="text-muted">{t('vouchers.none', lang)}</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    <Link
                      href={`/school/fees/vouchers/${v.id}`}
                      className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                    >
                      {t('vouchers.view', lang)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
