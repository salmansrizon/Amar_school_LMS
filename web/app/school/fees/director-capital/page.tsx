import Form from 'next/form'
import Link from 'next/link'
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs, headerPrimary, headerSecondary } from '@/lib/school-crumbs'
import { AccountingTabs } from '../accounting-tabs'
import { TransactionForm } from './director-capital-controls'
import { dateInputClass, filterButtonClass } from '@/components/ui/field'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'

// Director Capital (map 013 FC1): balance + invested/withdrawn stat cards,
// Invest / Withdraw header actions (open the unchanged TransactionForm), date
// range, then the transactions DataTable (Date | Type | Amount | Running
// Balance | Note).

type Txn = { id: string; txn_date: string; txn_type: string; amount: number; balance_after: number; note: string | null }

const PAGE_SIZE = 20

export default async function DirectorCapitalPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; from?: string; to?: string; type?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const { action: selectedAction = '', from = '', to = '', type = '', page, size } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: balanceRow } = await supabase.from('director_capital_balances').select('balance').maybeSingle()
  const balance = Number(balanceRow?.balance ?? 0)

  let query = supabase
    .from('director_capital_transactions')
    .select('id, txn_date, txn_type, amount, balance_after, note')
    .order('txn_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (from) query = query.gte('txn_date', from)
  if (to) query = query.lte('txn_date', to)
  const { data: transactions } = await query

  const all: Txn[] = (transactions ?? []).map((x) => ({
    ...x,
    amount: Number(x.amount),
    balance_after: Number(x.balance_after),
  }))
  const visible = all.filter((x) => !type || x.txn_type === type)
  const pageData = paginate(visible, page, pageSize)

  const action = selectedAction === 'withdraw' ? 'withdraw' : selectedAction === 'invest' ? 'invest' : null
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const fmt = numberFmt(lang)
  const tk = (n: number) => `৳${fmt.format(n)}`
  const sum = (k: string) => all.filter((x) => x.txn_type === k).reduce((s, x) => s + x.amount, 0)
  // The balance is a running total kept by the insert trigger (0055); the list
  // is whatever transaction rows exist (in the date range). When they disagree
  // — rows before the range, or rows removed without the balance being reversed
  // — the difference is shown as its own figure instead of leaving three
  // numbers that do not add up.
  const broughtForward = balance - (sum('invest') - sum('withdraw'))
  const typeLabel = (k: string) => t(k === 'invest' ? 'directorCapital.investType' : 'directorCapital.withdrawType', lang)

  const columns: Column<Txn>[] = [
    {
      key: 'date',
      header: t('directorCapital.date', lang),
      card: 'title',
      cell: (x) => <span className="font-semibold">{new Date(x.txn_date).toLocaleDateString(locale)}</span>,
    },
    {
      key: 'type',
      header: t('directorCapital.type', lang),
      card: 'badge',
      cell: (x) => <Pill tone={x.txn_type === 'invest' ? 'sky' : 'muted'}>{typeLabel(x.txn_type)}</Pill>,
    },
    { key: 'amount', header: t('directorCapital.amount', lang), align: 'right', cell: (x) => tk(x.amount) },
    { key: 'balance', header: t('directorCapital.runningBalance', lang), align: 'right', cell: (x) => tk(x.balance_after) },
    { key: 'note', header: t('directorCapital.note', lang), cell: (x) => x.note ?? <span className="text-muted">—</span> },
  ]

  return (
    <>
      <PageHeader
        title={t('directorCapital.title', lang)}
        crumbs={schoolCrumbs('/school/fees', lang, [
          { label: t('fees.title', lang), href: '/school/fees' },
          { label: t('directorCapital.title', lang) },
        ])}
        actions={
          <>
            <Link href="/school/fees/director-capital?action=invest#txn-form" className={headerSecondary}>
              {t('directorCapital.invest', lang)}
            </Link>
            <Link href="/school/fees/director-capital?action=withdraw#txn-form" className={headerPrimary}>
              {t('directorCapital.withdraw', lang)}
            </Link>
          </>
        }
      />

      <AccountingTabs active="directorCapital" lang={lang} />

      <StatGrid>
        <StatCard
          icon={<Wallet className="size-5" />}
          label={t('directorCapital.currentBalance', lang)}
          value={tk(balance)}
          note={broughtForward ? `${t('directorCapital.broughtForward', lang)}: ${tk(broughtForward)}` : undefined}
          noteTone="muted"
        />
        <StatCard
          icon={<ArrowDownCircle className="size-5" />}
          tone="sky"
          label={t('directorCapital.investType', lang)}
          value={tk(sum('invest'))}
        />
        <StatCard
          icon={<ArrowUpCircle className="size-5" />}
          tone="muted"
          label={t('directorCapital.withdrawType', lang)}
          value={tk(sum('withdraw'))}
        />
      </StatGrid>

      {action && <TransactionForm balance={balance} action={action} lang={lang} />}

      <Form className="mb-grid flex flex-wrap items-center gap-2" action="/school/fees/director-capital">
        {type && <input type="hidden" name="type" value={type} />}
        <input name="from" type="date" defaultValue={from} aria-label={t('vouchers.from', lang)} className={dateInputClass()} />
        <input name="to" type="date" defaultValue={to} aria-label={t('vouchers.to', lang)} className={dateInputClass()} />
        <button
          type="submit"
          className={filterButtonClass()}
        >
          {t('classes.filter', lang)}
        </button>
      </Form>

      <DataTable
        rows={pageData.items}
        rowId={(x) => x.id}
        rowLabel={(x) => x.txn_date}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('directorCapital.title', lang)}
        filters={[
          {
            param: 'type',
            label: t('directorCapital.type', lang),
            options: ['invest', 'withdraw'].map((k) => ({ value: k, label: typeLabel(k) })),
          },
        ]}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <Card>
            <p className="text-sm text-muted">{t('directorCapital.noTransactions', lang)}</p>
          </Card>
        }
      />
    </>
  )
}
