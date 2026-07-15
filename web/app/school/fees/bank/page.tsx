import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../accounting-tabs'
import { NewAccountForm, TransactionForm } from './bank-controls'

// Layout per ui/school-owner/bank-cash-accounts.html: toolbar ("+ New
// Account") over an Account Name | Type | Balance | Action (Deposit /
// Withdraw) table, plus a Deposit/Withdraw panel (the mockup's own
// "Withdraw — Cash Fund" guard demo) shown for whichever account/action was
// picked via the row buttons — same selection-via-searchParams pattern as
// the Fee Collection page's Collect/Edit flow.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; action?: string }>
}) {
  const { account: selectedAccount = '', action: selectedAction = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: accounts } = await supabase
    .from('bank_cash_accounts')
    .select('id, name, type, balance')
    .order('created_at')

  const active = accounts?.find((a) => a.id === selectedAccount) ?? null
  const action = selectedAction === 'withdraw' ? 'withdraw' : 'deposit'

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('bank.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AccountingTabs active="bank" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('bank.new', lang)}</h2>
        <NewAccountForm lang={lang} />
      </section>

      <section className="mb-6 overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        {!accounts?.length ? (
          <p className="text-sm text-muted">{t('bank.noAccounts', lang)}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('bank.accountName', lang)}</th>
                <th className={thClass}>{t('bank.type', lang)}</th>
                <th className={thClass}>{t('bank.balance', lang)}</th>
                <th className={thClass}>{t('bank.action', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="border-b border-line">
                  <td className={`${tdClass} font-medium`}>{acc.name}</td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        acc.type === 'bank' ? 'bg-sky-soft text-sky-deep' : 'bg-paper-muted text-muted'
                      }`}
                    >
                      {t(acc.type === 'bank' ? 'bank.bankType' : 'bank.cash', lang)}
                    </span>
                  </td>
                  <td className={tdClass}>৳{Number(acc.balance).toLocaleString()}</td>
                  <td className={`${tdClass} flex gap-2`}>
                    <Link
                      href={`/school/fees/bank?account=${acc.id}&action=deposit#txn-form`}
                      className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                    >
                      {t('bank.deposit', lang)}
                    </Link>
                    <Link
                      href={`/school/fees/bank?account=${acc.id}&action=withdraw#txn-form`}
                      className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                    >
                      {t('bank.withdraw', lang)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {active && (
        <TransactionForm
          accountId={active.id}
          accountName={active.name}
          accountType={active.type as 'cash' | 'bank'}
          balance={Number(active.balance)}
          action={action}
          lang={lang}
        />
      )}
    </main>
  )
}
