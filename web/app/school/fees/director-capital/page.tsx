import Form from 'next/form'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../accounting-tabs'
import { TransactionForm } from './director-capital-controls'
import { dateInputClass } from '@/components/ui/field'

// Layout per ui/school-owner/director-capital.html: toolbar (date-range
// filter, "+ Invest" / "+ Withdraw") over a Date | Type | Amount | Running
// Balance | Note table.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function DirectorCapitalPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; from?: string; to?: string }>
}) {
  const { action: selectedAction = '', from = '', to = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: balanceRow } = await supabase
    .from('director_capital_balances')
    .select('balance')
    .maybeSingle()
  const balance = Number(balanceRow?.balance ?? 0)

  let query = supabase
    .from('director_capital_transactions')
    .select('id, txn_date, txn_type, amount, balance_after, note')
    .order('txn_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (from) query = query.gte('txn_date', from)
  if (to) query = query.lte('txn_date', to)
  const { data: transactions } = await query

  const action = selectedAction === 'withdraw' ? 'withdraw' : selectedAction === 'invest' ? 'invest' : null
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('directorCapital.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AccountingTabs active="directorCapital" lang={lang} />

      <Form className="mb-4 flex flex-wrap items-center justify-between gap-2" action="/school/fees/director-capital">
        <div className="flex items-center gap-2">
          <input name="from" type="date" defaultValue={from} className={dateInputClass()} />
          <input name="to" type="date" defaultValue={to} className={dateInputClass()} />
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('classes.filter', lang)}
          </button>
        </div>
        <div className="flex gap-2">
          <Link
            href="/school/fees/director-capital?action=invest#txn-form"
            className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('directorCapital.invest', lang)}
          </Link>
          <Link
            href="/school/fees/director-capital?action=withdraw#txn-form"
            className="rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            {t('directorCapital.withdraw', lang)}
          </Link>
        </div>
      </Form>

      {action && <TransactionForm balance={balance} action={action} lang={lang} />}

      <section className="overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        {!transactions?.length ? (
          <p className="text-sm text-muted">{t('directorCapital.noTransactions', lang)}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('directorCapital.date', lang)}</th>
                <th className={thClass}>{t('directorCapital.type', lang)}</th>
                <th className={thClass}>{t('directorCapital.amount', lang)}</th>
                <th className={thClass}>{t('directorCapital.runningBalance', lang)}</th>
                <th className={thClass}>{t('directorCapital.note', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <tr key={txn.id} className="border-b border-line">
                  <td className={tdClass}>{new Date(txn.txn_date).toLocaleDateString(locale)}</td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        txn.txn_type === 'invest' ? 'bg-sky-soft text-sky-deep' : 'bg-paper-muted text-muted'
                      }`}
                    >
                      {t(txn.txn_type === 'invest' ? 'directorCapital.investType' : 'directorCapital.withdrawType', lang)}
                    </span>
                  </td>
                  <td className={tdClass}>৳{Number(txn.amount).toLocaleString()}</td>
                  <td className={tdClass}>৳{Number(txn.balance_after).toLocaleString()}</td>
                  <td className={tdClass}>{txn.note ?? <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
