import { Boxes, TrendingDown, Wallet } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang, formatDate } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { currentAssetValue } from '@/lib/accounting'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { AccountingTabs } from '../accounting-tabs'
import { NewAssetCategoryForm, NewAssetForm, type AssetCategoryOption } from './asset-controls'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { pageTitle } from '@/lib/page-title'

// Asset Register (map 013 FC1): stat cards, category panel + new-asset form
// (unchanged), then the assets DataTable (search, Category filter). No per-row
// action in the source mockup, so no drawer.

type Row = {
  id: string
  name: string
  categoryName: string
  category_id: string | null
  purchase_date: string
  purchase_value: number
  rate: number
  current: number
  attachment_name: string | null
}

const PAGE_SIZE = 20

export const generateMetadata = pageTitle('assets.title')

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const { q = '', category = '', page, size } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ data: categories }, { data: assetsRaw }] = await Promise.all([
    supabase.from('asset_categories').select('id, name').order('name'),
    supabase
      .from('assets')
      .select(
        'id, name, purchase_date, purchase_value, depreciation_rate_percent, attachment_name, category_id, asset_categories(name)',
      )
      .order('purchase_date', { ascending: false }),
  ])

  const today = new Date()
  const all: Row[] = (assetsRaw ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    categoryName: (a.asset_categories as unknown as { name: string } | null)?.name ?? '—',
    category_id: a.category_id,
    purchase_date: a.purchase_date,
    purchase_value: Number(a.purchase_value),
    rate: Number(a.depreciation_rate_percent),
    current: currentAssetValue(Number(a.purchase_value), Number(a.depreciation_rate_percent), a.purchase_date, today),
    attachment_name: a.attachment_name,
  }))
  const needle = q.toLowerCase()
  const visible = all.filter((a) => (!category || a.category_id === category) && (!needle || a.name.toLowerCase().includes(needle)))
  const pageData = paginate(visible, page, pageSize)

  const fmt = numberFmt(lang)
  const tk = (n: number) => `৳${fmt.format(n)}`
  const purchased = all.reduce((s, a) => s + a.purchase_value, 0)
  const current = all.reduce((s, a) => s + a.current, 0)

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('assets.name', lang),
      card: 'title',
      cell: (a) => (
        <div>
          <div className="font-semibold">{a.name}</div>
          <div className="text-xs text-muted">{formatDate(a.purchase_date, lang)}</div>
        </div>
      ),
    },
    { key: 'category', header: t('assets.category', lang), card: 'badge', cell: (a) => <Pill tone="muted">{a.categoryName}</Pill> },
    { key: 'purchase', header: t('assets.purchaseValue', lang), align: 'right', cell: (a) => tk(a.purchase_value) },
    {
      key: 'rate',
      header: t('assets.depreciation', lang),
      cell: (a) => `${fmt.format(a.rate)}% ${t('assets.perYear', lang)}`,
    },
    { key: 'current', header: t('assets.currentValue', lang), align: 'right', cell: (a) => tk(a.current) },
    {
      key: 'attachment',
      header: t('assets.attachment', lang),
      cell: (a) =>
        a.attachment_name ? (
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
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('assets.title', lang)}
        crumbs={schoolCrumbs('/school/fees', lang, [
          { label: t('fees.title', lang), href: '/school/fees' },
          { label: t('assets.title', lang) },
        ])}
        badge={`${t('pager.total', lang)}: ${fmt.format(all.length)}`}
      />

      <AccountingTabs active="assets" lang={lang} />

      <StatGrid>
        <StatCard icon={<Boxes className="size-5" />} label={t('assets.title', lang)} value={fmt.format(all.length)} />
        <StatCard icon={<Wallet className="size-5" />} tone="sky" label={t('assets.purchaseValue', lang)} value={tk(purchased)} />
        <StatCard
          icon={<TrendingDown className="size-5" />}
          tone="mint"
          label={t('assets.currentValue', lang)}
          value={tk(current)}
        />
      </StatGrid>

      <div className="mb-section grid gap-grid lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">{t('assets.categoriesTitle', lang)}</h2>
          <NewAssetCategoryForm lang={lang} />
          {!categories?.length ? (
            <p className="mt-3 text-sm text-muted">{t('assets.noCategories', lang)}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((c) => (
                <Pill key={c.id} tone="muted">
                  {c.name}
                </Pill>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">{t('assets.newTitle', lang)}</h2>
          {!categories?.length ? (
            <p className="text-sm text-muted">{t('assets.noCategories', lang)}</p>
          ) : (
            <NewAssetForm categories={categories as AssetCategoryOption[]} lang={lang} />
          )}
        </Card>
      </div>

      <DataTable
        rows={pageData.items}
        rowId={(a) => a.id}
        rowLabel={(a) => a.name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('assets.title', lang)}
        search={{ placeholder: t('assets.searchPlaceholder', lang) }}
        filters={[
          {
            param: 'category',
            label: t('assets.category', lang),
            options: (categories ?? []).map((c) => ({ value: c.id, label: c.name })),
          },
        ]}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <EmptyState
            icon="fees"
            title={t('assets.noAssets', lang)}
            action={{ href: '/school/fees/assets', label: t('students.clearFilters', lang) }}
            lang={lang}
          />
        }
      />
    </>
  )
}
