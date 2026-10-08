import Link from 'next/link'
import { Banknote, Landmark, Wallet } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs, rowAction } from '@/lib/school-crumbs'
import { AccountingTabs } from '../accounting-tabs'
import { NewAccountForm, TransactionForm } from './bank-controls'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { pageTitle } from '@/lib/page-title'

// Bank & Cash (map 013 FC1): balance stat cards, new-account form, accounts
// DataTable with Deposit / Withdraw row actions. The chosen account's
// Deposit/Withdraw panel (TransactionForm) is unchanged — same
// selection-via-searchParams pattern as the Fee Collection page.

type Account = { id: string; name: string; type: string; balance: number }

export const generateMetadata = pageTitle('bank.title')

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; action?: string }>
}) {
  const params = await searchParams
  const { account: selectedAccount = '', action: selectedAction = '' } = params
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data } = await supabase.from('bank_cash_accounts').select('id, name, type, balance').order('created_at')
  const accounts: Account[] = (data ?? []).map((a) => ({ ...a, balance: Number(a.balance) }))

  const active = accounts.find((a) => a.id === selectedAccount) ?? null
  const action = selectedAction === 'withdraw' ? 'withdraw' : 'deposit'

  const fmt = numberFmt(lang)
  const tk = (n: number) => `৳${fmt.format(n)}`
  const total = (type?: string) => accounts.filter((a) => !type || a.type === type).reduce((s, a) => s + a.balance, 0)

  const columns: Column<Account>[] = [
    { key: 'name', header: t('bank.accountName', lang), card: 'title', cell: (a) => <span className="font-semibold">{a.name}</span> },
    {
      key: 'type',
      header: t('bank.type', lang),
      card: 'badge',
      cell: (a) => <Pill tone={a.type === 'bank' ? 'sky' : 'muted'}>{t(a.type === 'bank' ? 'bank.bankType' : 'bank.cash', lang)}</Pill>,
    },
    { key: 'balance', header: t('bank.balance', lang), align: 'right', cell: (a) => tk(a.balance) },
  ]

  return (
    <>
      <PageHeader
        title={t('bank.title', lang)}
        crumbs={schoolCrumbs('/school/fees', lang, [
          { label: t('fees.title', lang), href: '/school/fees' },
          { label: t('bank.title', lang) },
        ])}
        badge={`${t('pager.total', lang)}: ${fmt.format(accounts.length)}`}
      />

      <AccountingTabs active="bank" lang={lang} />

      <StatGrid>
        <StatCard icon={<Wallet className="size-5" />} label={t('bank.balance', lang)} value={tk(total())} />
        <StatCard icon={<Banknote className="size-5" />} tone="mint" label={t('bank.cash', lang)} value={tk(total('cash'))} />
        <StatCard icon={<Landmark className="size-5" />} tone="sky" label={t('bank.bankType', lang)} value={tk(total('bank'))} />
      </StatGrid>

      <Card className="mb-section">
        <h2 className="mb-3 font-bold">{t('bank.new', lang)}</h2>
        <NewAccountForm lang={lang} />
      </Card>

      <DataTable
        rows={accounts}
        rowId={(a) => a.id}
        rowLabel={(a) => a.name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('bank.title', lang)}
        rowActions={(a) => (
          <>
            <Link href={`/school/fees/bank?account=${a.id}&action=deposit#txn-form`} className={rowAction}>
              {t('bank.deposit', lang)}
            </Link>
            <Link href={`/school/fees/bank?account=${a.id}&action=withdraw#txn-form`} className={rowAction}>
              {t('bank.withdraw', lang)}
            </Link>
          </>
        )}
        empty={
          <Card>
            <p className="text-sm text-muted">{t('bank.noAccounts', lang)}</p>
          </Card>
        }
      />

      {active && (
        <div className="mt-section">
          <TransactionForm
            accountId={active.id}
            accountName={active.name}
            accountType={active.type as 'cash' | 'bank'}
            balance={active.balance}
            action={action}
            lang={lang}
          />
        </div>
      )}
    </>
  )
}
