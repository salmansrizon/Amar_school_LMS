'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { insufficientBalance } from '@/lib/accounting'
import { t, type Lang } from '@/lib/i18n'
import { recordBankTransaction, saveBankAccount } from './actions'

/** "+ New Account" form: Name, Type (Cash/Bank), Opening Balance. No
 *  dedicated mockup screen for this (bank-cash-accounts.html only shows the
 *  account list + a Withdraw guard demo), but it's required to create an
 *  account at all. */
export function NewAccountForm({ lang }: { lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await saveBankAccount(data)
          if (result.error) {
            setError(result.error)
            return
          }
          form.reset()
          router.refresh()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="acc_name">
          {t('bank.accountName', lang)}
        </label>
        <input id="acc_name" name="name" type="text" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="acc_type">
          {t('bank.type', lang)}
        </label>
        <select id="acc_type" name="type" required defaultValue="cash" className={inputClass}>
          <option value="cash">{t('bank.cash', lang)}</option>
          <option value="bank">{t('bank.bankType', lang)}</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="opening_balance">
          {t('bank.openingBalance', lang)}
        </label>
        <input
          id="opening_balance"
          name="opening_balance"
          type="number"
          min={0}
          step="0.01"
          defaultValue={0}
          className={inputClass}
        />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={pending} className={primaryBtnClass}>
          {t('bank.create', lang)}
        </button>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}

/** Deposit/Withdraw panel per ui/school-owner/bank-cash-accounts.html's
 *  "Withdraw — Cash Fund" demo section: current-balance line, Amount,
 *  optional Reason, and — since the account is a bank account — Payment
 *  method (Cash/Cheque) with Cheque No/Date when Cheque is chosen (PRD §5.6
 *  cheque tracking; the mockup's demo only illustrates the guard for a Cash
 *  account, which has no cheque concept). Confirm is disabled client-side
 *  when a withdrawal would exceed the balance — insufficientBalance mirrors
 *  the real DB-level guard (apply_bank_cash_transaction, 0055). */
export function TransactionForm({
  accountId,
  accountName,
  accountType,
  balance,
  action,
  lang,
}: {
  accountId: string
  accountName: string
  accountType: 'cash' | 'bank'
  balance: number
  action: 'deposit' | 'withdraw'
  lang: Lang
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'cheque'>('cash')
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const blocked = action === 'withdraw' && insufficientBalance(balance, amount)

  return (
    <div id="txn-form" className="rounded-lg border border-line bg-paper p-5 shadow-card">
      <h3 className="mt-0 mb-1 font-bold">
        {t(action === 'withdraw' ? 'bank.withdrawTitleFor' : 'bank.depositTitleFor', lang)}
        {accountName}
      </h3>
      <p className="mb-4 text-sm text-muted">
        {t('bank.currentBalance', lang)}: ৳{balance.toLocaleString()}
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          data.set('account_id', accountId)
          data.set('txn_type', action)
          startTransition(async () => {
            setError(null)
            const result = await recordBankTransaction(data)
            if (result.error) {
              setError(result.error)
              return
            }
            router.push('/school/fees/bank')
            router.refresh()
          })
        }}
      >
        <div>
          <label className={labelClass} htmlFor="amount">
            {t(action === 'withdraw' ? 'bank.withdrawAmount' : 'bank.depositAmount', lang)}
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
          {blocked && <p className="mt-1 text-xs text-alert-deep">{t('bank.insufficientBalance', lang)}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="txn_date">
            {t('vouchers.date', lang)}
          </label>
          <input id="txn_date" name="txn_date" type="date" defaultValue={today} className={inputClass} />
        </div>
        {accountType === 'bank' && (
          <>
            <div>
              <label className={labelClass} htmlFor="payment_method">
                {t('bank.paymentMethod', lang)}
              </label>
              <select
                id="payment_method"
                name="payment_method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value === 'cheque' ? 'cheque' : 'cash')}
                className={inputClass}
              >
                <option value="cash">{t('fees.cash', lang)}</option>
                <option value="cheque">{t('fees.cheque', lang)}</option>
              </select>
            </div>
            {paymentMethod === 'cheque' && (
              <>
                <div>
                  <label className={labelClass} htmlFor="cheque_no">
                    {t('bank.chequeNo', lang)}
                  </label>
                  <input id="cheque_no" name="cheque_no" type="text" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="cheque_date">
                    {t('bank.chequeDate', lang)}
                  </label>
                  <input id="cheque_date" name="cheque_date" type="date" className={inputClass} />
                </div>
              </>
            )}
          </>
        )}
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="reason">
            {t('bank.reason', lang)}
          </label>
          <input
            id="reason"
            name="reason"
            type="text"
            placeholder={t('bank.optional', lang)}
            className={inputClass}
          />
        </div>
        {error && (
          <p className="text-sm text-alert-deep sm:col-span-2">
            {error === 'insufficient_balance' ? t('bank.insufficientBalance', lang) : error}
          </p>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={pending || blocked} className={primaryBtnClass}>
            {t(action === 'withdraw' ? 'bank.confirmWithdraw' : 'bank.confirmDeposit', lang)}
          </button>
          <button
            type="button"
            onClick={() => router.push('/school/fees/bank')}
            className="h-10 cursor-pointer rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-paper-muted"
          >
            {t('fees.cancel', lang)}
          </button>
        </div>
      </form>
    </div>
  )
}
