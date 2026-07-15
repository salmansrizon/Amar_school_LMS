import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { buildGeneralLedger, type LedgerSource, type LedgerSourceRow } from '@/lib/accounting'
import { PrintPage, InstituteHeader, QrFooterRow } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'
import { AccountingTabs } from '../accounting-tabs'

// Layout per ui/school-owner/general-ledger.html: a date-range toolbar over a
// Date | Source | Description | Debit | Credit | Balance table, combining
// director cash (director_capital_transactions) + assets (purchases) +
// vouchers (income/expense) + bank (bank_cash_transactions) + fee
// collections (fee_collection_records) — PRD §5.6. Every source is fetched
// RLS-scoped (no cross-School leakage) and merged by buildGeneralLedger
// (lib/accounting.ts), which computes the running Balance over each
// School's FULL history so narrowing the date range doesn't corrupt it.
//
// Printable body composes the shared template layer (ADR 0007 —
// PrintPage/InstituteHeader/QrFooterRow), same as every other printable
// added after that layer landed (routine print, mark sheets, progress
// reports); only the chrome (tabs, date filter, print button) is app-only
// and hidden via print:hidden.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

const SOURCE_LABEL: Record<LedgerSource, string> = {
  fee_collection: 'ledger.sourceFeeCollection',
  voucher: 'ledger.sourceVoucher',
  asset: 'ledger.sourceAsset',
  bank_cash: 'ledger.sourceBank',
  director_capital: 'ledger.sourceDirectorCapital',
}

const SOURCE_BADGE: Record<LedgerSource, string> = {
  fee_collection: 'bg-sky-soft text-sky-deep',
  voucher: 'bg-paper-muted text-muted',
  asset: 'bg-paper-muted text-muted',
  bank_cash: 'bg-paper-muted text-muted',
  director_capital: 'bg-sky-soft text-sky-deep',
}

function monthBounds(): { from: string; to: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const defaults = monthBounds()
  const { from = defaults.from, to = defaults.to } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const {
    data: school,
    error: schoolError,
  } = await supabase.from('schools').select('name').maybeSingle()
  if (schoolError || !school) notFound()

  const [{ data: feeRecords }, { data: vouchers }, { data: assets }, { data: bankTxns }, { data: directorTxns }] =
    await Promise.all([
      supabase
        .from('fee_collection_records')
        .select('id, month, year, pay_amount, updated_at, students(full_name)'),
      supabase.from('vouchers').select('id, txn_date, description, amount, created_at, voucher_categories(type)'),
      supabase.from('assets').select('id, name, purchase_date, purchase_value, created_at'),
      supabase
        .from('bank_cash_transactions')
        .select('id, txn_date, txn_type, amount, created_at, bank_cash_accounts(name)'),
      supabase.from('director_capital_transactions').select('id, txn_date, txn_type, amount, note, created_at'),
    ])

  const rows: LedgerSourceRow[] = []

  for (const r of feeRecords ?? []) {
    const student = r.students as unknown as { full_name: string } | null
    rows.push({
      date: new Date(r.updated_at).toISOString().slice(0, 10),
      sortKey: r.updated_at,
      source: 'fee_collection',
      description: `${student?.full_name ?? '—'} — ${r.month}/${r.year}`,
      debit: 0,
      credit: Number(r.pay_amount),
    })
  }

  for (const v of vouchers ?? []) {
    const category = v.voucher_categories as unknown as { type: string } | null
    const isIncome = category?.type === 'income'
    rows.push({
      date: v.txn_date,
      sortKey: v.created_at,
      source: 'voucher',
      description: v.description,
      debit: isIncome ? 0 : Number(v.amount),
      credit: isIncome ? Number(v.amount) : 0,
    })
  }

  for (const a of assets ?? []) {
    rows.push({
      date: a.purchase_date,
      sortKey: a.created_at,
      source: 'asset',
      description: `${a.name} ${t('ledger.assetPurchaseLabel', lang)}`,
      debit: Number(a.purchase_value),
      credit: 0,
    })
  }

  for (const b of bankTxns ?? []) {
    const account = b.bank_cash_accounts as unknown as { name: string } | null
    const isDeposit = b.txn_type === 'deposit'
    rows.push({
      date: b.txn_date,
      sortKey: b.created_at,
      source: 'bank_cash',
      description: `${account?.name ?? '—'} — ${t(isDeposit ? 'ledger.bankDepositLabel' : 'ledger.bankWithdrawLabel', lang)}`,
      debit: isDeposit ? 0 : Number(b.amount),
      credit: isDeposit ? Number(b.amount) : 0,
    })
  }

  for (const d of directorTxns ?? []) {
    const isInvest = d.txn_type === 'invest'
    const label = t(isInvest ? 'directorCapital.investType' : 'directorCapital.withdrawType', lang)
    rows.push({
      date: d.txn_date,
      sortKey: d.created_at,
      source: 'director_capital',
      description: d.note ? `${label} — ${d.note}` : label,
      debit: isInvest ? 0 : Number(d.amount),
      credit: isInvest ? Number(d.amount) : 0,
    })
  }

  const entries = buildGeneralLedger(rows, from, to)
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-extrabold">{t('ledger.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <div className="print:hidden">
        <AccountingTabs active="ledger" lang={lang} />
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <label className="text-xs text-muted">{t('ledger.dateRange', lang)}</label>
        <input name="from" type="date" defaultValue={from} className="h-9 rounded-md border border-line px-3 text-sm" />
        <input name="to" type="date" defaultValue={to} className="h-9 rounded-md border border-line px-3 text-sm" />
        <button
          type="submit"
          className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('ledger.apply', lang)}
        </button>
        <div className="ml-auto">
          <PrintButton label={t('print.print', lang)} />
        </div>
      </form>

      <PrintPage>
        <InstituteHeader
          name={school.name}
          meta={`${new Date(from).toLocaleDateString(locale)} – ${new Date(to).toLocaleDateString(locale)}`}
          docTitle={t('ledger.title', lang)}
        />

        {!entries.length ? (
          <p className="text-sm text-muted">{t('ledger.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('ledger.date', lang)}</th>
                <th className={thClass}>{t('ledger.source', lang)}</th>
                <th className={thClass}>{t('ledger.description', lang)}</th>
                <th className={thClass}>{t('ledger.debit', lang)}</th>
                <th className={thClass}>{t('ledger.credit', lang)}</th>
                <th className={thClass}>{t('ledger.balance', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr key={idx} className="border-b border-line">
                  <td className={tdClass}>{new Date(e.date).toLocaleDateString(locale)}</td>
                  <td className={tdClass}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SOURCE_BADGE[e.source]}`}>
                      {t(SOURCE_LABEL[e.source] as 'ledger.sourceVoucher', lang)}
                    </span>
                  </td>
                  <td className={tdClass}>{e.description}</td>
                  <td className={tdClass}>{e.debit ? `৳${e.debit.toLocaleString()}` : '—'}</td>
                  <td className={tdClass}>{e.credit ? `৳${e.credit.toLocaleString()}` : '—'}</td>
                  <td className={`${tdClass} font-medium`}>৳{e.balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} />
      </PrintPage>
    </main>
  )
}
