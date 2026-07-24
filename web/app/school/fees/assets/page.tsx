import Form from 'next/form'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { currentAssetValue } from '@/lib/accounting'
import { AccountingTabs } from '../accounting-tabs'
import { NewAssetCategoryForm, NewAssetForm, type AssetCategoryOption } from './asset-controls'
import { selectClass } from '@/components/ui/field'

// Layout per ui/school-owner/asset-register.html: toolbar (search + Category
// filter, "+ Add Asset") over an Asset Name | Category | Purchase Date |
// Purchase Value | Depreciation | Current Value | Attachment table (no
// per-row Action column in the mockup). Category management (same rationale
// as vouchers) is a compact panel above the New Asset form.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  const { q = '', category = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: categories } = await supabase.from('asset_categories').select('id, name').order('name')

  const { data: assetsRaw } = await supabase
    .from('assets')
    .select(
      'id, name, purchase_date, purchase_value, depreciation_rate_percent, attachment_name, category_id, asset_categories(name)',
    )
    .order('purchase_date', { ascending: false })

  let assets = (assetsRaw ?? []).map((a) => ({
    ...a,
    categoryName: (a.asset_categories as unknown as { name: string } | null)?.name ?? '—',
  }))
  if (category) assets = assets.filter((a) => a.category_id === category)
  if (q) {
    const needle = q.toLowerCase()
    assets = assets.filter((a) => a.name.toLowerCase().includes(needle))
  }

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const today = new Date()

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('assets.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AccountingTabs active="assets" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('assets.categoriesTitle', lang)}</h2>
        <NewAssetCategoryForm lang={lang} />
        {!categories?.length ? (
          <p className="mt-3 text-sm text-muted">{t('assets.noCategories', lang)}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <span key={c.id} className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
                {c.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('assets.newTitle', lang)}</h2>
        {!categories?.length ? (
          <p className="text-sm text-muted">{t('assets.noCategories', lang)}</p>
        ) : (
          <NewAssetForm categories={categories as AssetCategoryOption[]} lang={lang} />
        )}
      </section>

      <section className="overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        <Form className="mb-4 flex flex-wrap items-center gap-2" action="/school/fees/assets">
          <input
            name="q"
            defaultValue={q}
            type="text"
            placeholder={t('assets.searchPlaceholder', lang)}
            className="h-9 rounded-md border border-line px-3 text-sm"
          />
          <select name="category" defaultValue={category} className={selectClass()}>
            <option value="">{t('assets.allCategories', lang)}</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('vouchers.filter', lang)}
          </button>
        </Form>

        {!assets.length ? (
          <p className="text-sm text-muted">{t('assets.noAssets', lang)}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('assets.name', lang)}</th>
                <th className={thClass}>{t('assets.category', lang)}</th>
                <th className={thClass}>{t('assets.purchaseDate', lang)}</th>
                <th className={thClass}>{t('assets.purchaseValue', lang)}</th>
                <th className={thClass}>{t('assets.depreciation', lang)}</th>
                <th className={thClass}>{t('assets.currentValue', lang)}</th>
                <th className={thClass}>{t('assets.attachment', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const current = currentAssetValue(
                  Number(a.purchase_value),
                  Number(a.depreciation_rate_percent),
                  a.purchase_date,
                  today,
                )
                return (
                  <tr key={a.id} className="border-b border-line">
                    <td className={`${tdClass} font-medium`}>{a.name}</td>
                    <td className={tdClass}>
                      <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
                        {a.categoryName}
                      </span>
                    </td>
                    <td className={tdClass}>{new Date(a.purchase_date).toLocaleDateString(locale)}</td>
                    <td className={tdClass}>৳{Number(a.purchase_value).toLocaleString()}</td>
                    <td className={tdClass}>
                      {Number(a.depreciation_rate_percent)}% {t('assets.perYear', lang)}
                    </td>
                    <td className={tdClass}>৳{current.toLocaleString()}</td>
                    <td className={tdClass}>
                      {a.attachment_name ? (
                        <a
                          href={`/api/accounting-attachment?kind=asset&id=${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-600 hover:underline"
                        >
                          📎 {a.attachment_name}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
