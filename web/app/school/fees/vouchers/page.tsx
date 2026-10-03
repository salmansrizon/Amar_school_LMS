import Form from 'next/form'
import { ArrowDownCircle, ArrowUpCircle, FileText } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang, formatDate } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { AccountingTabs } from '../accounting-tabs'
import { NewVoucherCategoryForm, NewVoucherForm, type CategoryOption } from './voucher-controls'
import { dateInputClass, filterButtonClass } from '@/components/ui/field'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { pageTitle } from '@/lib/page-title'

// Vouchers (map 013 FC1): stat cards (income / expense over the listed range),
// category panel + new-voucher form (unchanged), then the vouchers DataTable
// (search, Type filter, date range) with a read-only detail drawer; the full
// page `/vouchers/[id]` stays.

type Row = {
  id: string
  voucher_no: string | null
  txn_date: string
  description: string
  amount: number
  attachment_name: string | null
  category: { name: string; type: string } | null
}

const PAGE_SIZE = 20

export const generateMetadata = pageTitle('vouchers.title')

export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; from?: string; to?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', type = '', from = '', to = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: categories } = await supabase.from('voucher_categories').select('id, name, type').order('name')

  let query = supabase
    .from('vouchers')
    .select('id, voucher_no, txn_date, description, amount, attachment_name, voucher_categories(name, type)')
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (from) query = query.gte('txn_date', from)
  if (to) query = query.lte('txn_date', to)
  const { data: vouchersRaw } = await query

  const inRange: Row[] = (vouchersRaw ?? []).map((v) => ({
    ...v,
    amount: Number(v.amount),
    category: v.voucher_categories as unknown as Row['category'],
  }))
  const needle = q.toLowerCase()
  const vouchers = inRange.filter(
    (v) =>
      (!type || v.category?.type === type) &&
      (!needle || v.voucher_no?.toLowerCase().includes(needle) || v.description.toLowerCase().includes(needle)),
  )
  const pageData = paginate(vouchers, page, pageSize)
  const viewed = view ? (inRange.find((v) => v.id === view) ?? null) : null

  const fmt = numberFmt(lang)
  const tk = (n: number) => `৳${fmt.format(n)}`
  const sum = (kind: string) => inRange.filter((v) => v.category?.type === kind).reduce((s, v) => s + v.amount, 0)
  const income = sum('income')
  const expense = sum('expense')
  const date = (d: string) => formatDate(d, lang)
  const typeLabel = (v: Row) => t(v.category?.type === 'income' ? 'vouchers.income' : 'vouchers.expense', lang)
  const attachment = (v: Row) =>
    v.attachment_name ? (
      <a
        href={`/api/accounting-attachment?kind=voucher&id=${v.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 hover:underline"
      >
        📎 {v.attachment_name}
      </a>
    ) : (
      <span className="text-muted">{t('vouchers.none', lang)}</span>
    )

  const columns: Column<Row>[] = [
    {
      key: 'no',
      header: t('vouchers.voucherNo', lang),
      card: 'title',
      cell: (v) => (
        <div>
          <div className="font-semibold">{v.voucher_no}</div>
          <div className="text-xs text-muted">{date(v.txn_date)}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: t('vouchers.type', lang),
      card: 'badge',
      cell: (v) => (
        <div>
          <Pill tone={v.category?.type === 'income' ? 'sky' : 'muted'}>{typeLabel(v)}</Pill>
          {v.category?.name && <div className="mt-1 text-xs text-muted">{v.category.name}</div>}
        </div>
      ),
    },
    { key: 'description', header: t('vouchers.description', lang), className: 'max-w-64 truncate', cell: (v) => v.description },
    { key: 'amount', header: t('vouchers.amount', lang), align: 'right', cell: (v) => tk(v.amount) },
    { key: 'attachment', header: t('vouchers.attachment', lang), cell: attachment },
  ]

  return (
    <>
      <PageHeader
        title={t('vouchers.title', lang)}
        crumbs={schoolCrumbs('/school/fees', lang, [
          { label: t('fees.title', lang), href: '/school/fees' },
          { label: t('vouchers.title', lang) },
        ])}
        badge={`${t('pager.total', lang)}: ${fmt.format(inRange.length)}`}
      />

      <AccountingTabs active="vouchers" lang={lang} />

      <StatGrid>
        <StatCard icon={<FileText className="size-5" />} label={t('vouchers.title', lang)} value={fmt.format(inRange.length)} />
        <StatCard
          icon={<ArrowDownCircle className="size-5" />}
          tone="mint"
          label={t('vouchers.income', lang)}
          value={tk(income)}
        />
        <StatCard
          icon={<ArrowUpCircle className="size-5" />}
          tone="alert"
          label={t('vouchers.expense', lang)}
          value={tk(expense)}
        />
      </StatGrid>

      <div className="mb-section grid gap-grid lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">{t('vouchers.categoriesTitle', lang)}</h2>
          <NewVoucherCategoryForm lang={lang} />
          {!categories?.length ? (
            <p className="mt-3 text-sm text-muted">{t('vouchers.noCategories', lang)}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((c) => (
                <Pill key={c.id} tone={c.type === 'income' ? 'mint' : 'muted'}>
                  {c.name} · {t(c.type === 'income' ? 'vouchers.income' : 'vouchers.expense', lang)}
                </Pill>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">{t('vouchers.newTitle', lang)}</h2>
          {!categories?.length ? (
            <p className="text-sm text-muted">{t('vouchers.noCategories', lang)}</p>
          ) : (
            <NewVoucherForm categories={categories as CategoryOption[]} lang={lang} />
          )}
        </Card>
      </div>

      {/* Date range: a plain GET form beside the DataTable toolbar, carrying the
          table's own filters so applying a range keeps them. */}
      <Form className="mb-grid flex flex-wrap items-center gap-2" action="/school/fees/vouchers">
        {q && <input type="hidden" name="q" value={q} />}
        {type && <input type="hidden" name="type" value={type} />}
        <input name="from" type="date" defaultValue={from} aria-label={t('vouchers.from', lang)} className={dateInputClass()} />
        <input name="to" type="date" defaultValue={to} aria-label={t('vouchers.to', lang)} className={dateInputClass()} />
        <button
          type="submit"
          className={filterButtonClass()}
        >
          {t('vouchers.filter', lang)}
        </button>
      </Form>

      <DataTable
        rows={pageData.items}
        rowId={(v) => v.id}
        rowLabel={(v) => v.voucher_no ?? v.description}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('vouchers.title', lang)}
        search={{ placeholder: t('vouchers.searchPlaceholder', lang) }}
        filters={[
          {
            param: 'type',
            label: t('vouchers.type', lang),
            options: [
              { value: 'income', label: t('vouchers.income', lang) },
              { value: 'expense', label: t('vouchers.expense', lang) },
            ],
          },
        ]}
        rowActions={(v) => (
          <ViewLink id={v.id} params={params} label={t('vouchers.view', lang)} name={v.voucher_no ?? v.description} />
        )}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <EmptyState
            title={t('vouchers.noVouchers', lang)}
            action={{ href: '/school/fees/vouchers', label: t('students.clearFilters', lang) }}
            lang={lang}
          />
        }
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.voucher_no ?? ''}
        subtitle={viewed ? date(viewed.txn_date) : undefined}
        fullPageHref={viewed ? `/school/fees/vouchers/${viewed.id}` : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('vouchers.type', lang)}</dt>
              <dd>{typeLabel(viewed)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('vouchers.category', lang)}</dt>
              <dd>{viewed.category?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('vouchers.description', lang)}</dt>
              <dd className="text-right">{viewed.description}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-bold">
              <dt>{t('vouchers.amount', lang)}</dt>
              <dd>{tk(viewed.amount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('vouchers.attachment', lang)}</dt>
              <dd>{attachment(viewed)}</dd>
            </div>
          </dl>
        )}
      </RecordDrawer>
    </>
  )
}
