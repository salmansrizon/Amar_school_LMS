'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { insufficientBalance } from '@/lib/accounting'
import { t, type Lang } from '@/lib/i18n'
import { recordDirectorCapitalTransaction } from './actions'

/** Invest/Withdraw panel, opened from the "+ Invest"/"+ Withdraw" toolbar
 *  buttons (ui/school-owner/director-capital.html). Confirm is disabled
 *  client-side when a withdrawal would exceed the running balance —
 *  insufficientBalance mirrors the real DB-level guard
 *  (apply_director_capital_transaction, 0055). */
export function TransactionForm({
  balance,
  action,
  lang,
}: {
  balance: number
  action: 'invest' | 'withdraw'
  lang: Lang
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const blocked = action === 'withdraw' && insufficientBalance(balance, amount)

  return (
    <div id="txn-form" className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
      <h3 className="mt-0 mb-1 font-bold">
        {t(action === 'withdraw' ? 'directorCapital.withdrawTitle' : 'directorCapital.investTitle', lang)}
      </h3>
      <p className="mb-4 text-sm text-muted">
        {t('directorCapital.currentBalance', lang)}: ৳{balance.toLocaleString()}
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          data.set('txn_type', action)
          startTransition(async () => {
            setError(null)
            const result = await recordDirectorCapitalTransaction(data)
            if (result.error) {
              setError(result.error)
              return
            }
            router.push('/school/fees/director-capital')
            router.refresh()
          })
        }}
      >
        <div>
          <label className={labelClass} htmlFor="amount">
            {t('directorCapital.amount', lang)}
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min={0.01}
            step="0.01"
            required
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className={inputClass}
          />
          {blocked && (
            <p className="mt-1 text-xs text-alert-deep">{t('directorCapital.insufficientBalance', lang)}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="txn_date">
            {t('directorCapital.date', lang)}
          </label>
          <input id="txn_date" name="txn_date" type="date" defaultValue={today} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="note">
            {t('directorCapital.note', lang)}
          </label>
          <input id="note" name="note" type="text" placeholder={t('bank.optional', lang)} className={inputClass} />
        </div>
        {error && (
          <p className="text-sm text-alert-deep sm:col-span-2">
            {error === 'insufficient_balance' ? t('directorCapital.insufficientBalance', lang) : error}
          </p>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={pending || blocked} className={primaryBtnClass}>
            {t(action === 'withdraw' ? 'directorCapital.confirmWithdraw' : 'directorCapital.confirmInvest', lang)}
          </button>
          <button
            type="button"
            onClick={() => router.push('/school/fees/director-capital')}
            className="h-10 cursor-pointer rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-paper-muted"
          >
            {t('fees.cancel', lang)}
          </button>
        </div>
      </form>
    </div>
  )
}
