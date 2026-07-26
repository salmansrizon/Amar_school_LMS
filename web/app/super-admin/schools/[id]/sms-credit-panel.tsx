'use client'

import { useState, useTransition } from 'react'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import type { LedgerEntry } from '@/lib/super-admin/school-detail-read-model'
import { topUpSmsCredits } from '../actions'

// Admin SMS-credit panel (map #171 T7): a school's remaining balance, a top-up
// form (credits granted + ৳ collected), and the recent ledger. Balance/history
// are computed server-side from sms_credit_ledger and passed in; the top-up
// writes a credit row via the server action.

const REASON_KEY: Record<LedgerEntry['reason'], MessageKey> = {
  topup: 'sa.sms.reasonTopup',
  send: 'sa.sms.reasonSend',
  adjust: 'sa.sms.reasonAdjust',
}

const input =
  'h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

export function SmsCreditPanel({
  schoolId,
  balance,
  entries,
  lang,
}: {
  schoolId: string
  balance: number
  entries: LedgerEntry[]
  lang: Lang
}) {
  const [credits, setCredits] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const c = Number(credits)
    const a = Number(amount)
    startTransition(async () => {
      setError(null)
      setDone(false)
      const result = await topUpSmsCredits(schoolId, c, a, note.trim() || null)
      if (result.error) setError(result.error)
      else {
        setDone(true)
        setCredits('')
        setAmount('')
        setNote('')
      }
    })
  }

  return (
    <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">{t('sa.sms.creditTitle', lang)}</h2>
        <span className="text-sm">
          <span className="text-muted">{t('sa.sms.balance', lang)}: </span>
          <span className={`font-extrabold ${balance < 0 ? 'text-alert-deep' : 'text-ink'}`}>{balance}</span>
        </span>
      </div>

      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-4">
        <div>
          <label className="text-xs font-semibold text-muted">{t('sa.sms.credits', lang)}</label>
          <input type="number" min={1} value={credits} onChange={(e) => setCredits(e.target.value)} required className={input} />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted">{t('sa.sms.amount', lang)}</label>
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-muted">{t('sa.sms.note', lang)}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </div>
        <button type="submit" disabled={pending} className={`${btn} sm:col-span-4`}>
          {done ? t('sa.sms.topped', lang) : t('sa.sms.topup', lang)}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}

      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold text-muted">{t('sa.sms.history', lang)}</h3>
        {entries.length === 0 ? (
          <p className="text-xs text-muted">{t('sa.sms.noHistory', lang)}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {entries.map((e, i) => (
              <li key={`${e.created_at}-${i}`} className="flex items-center justify-between gap-2 py-1.5">
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      e.reason === 'topup' ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-muted'
                    }`}
                  >
                    {t(REASON_KEY[e.reason], lang)}
                  </span>
                  <span className={`font-bold ${e.delta < 0 ? 'text-alert-deep' : 'text-mint-deep'}`}>
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </span>
                  {e.amount != null && <span className="text-muted">৳{e.amount}</span>}
                  {e.note && <span className="truncate text-muted">· {e.note}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{e.created_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
