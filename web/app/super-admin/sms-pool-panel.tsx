'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { SectionCard } from '@/components/super-admin/dashboard-ui'
import type { SmsPool } from '@/lib/sms/pool'
import { recordSmsPurchase } from './dashboard-actions'

// Master SMS pool panel (#188): the vendor's available (unallocated) SMS, what's
// been bought vs allocated, a record-purchase form, and a re-buy nudge when low.
// Placement on the dashboard is provisional — map #184 finalizes the UX.

const input =
  'h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

export function SmsPoolPanel({ pool, lang }: { pool: SmsPool; lang: Lang }) {
  const [qty, setQty] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      setError(null)
      setDone(false)
      const result = await recordSmsPurchase(Number(qty), Number(amount), note.trim() || null)
      if (result.error) setError(result.error)
      else {
        setDone(true)
        setQty('')
        setAmount('')
        setNote('')
      }
    })
  }

  const balanceTone =
    pool.level === 'empty' ? 'text-alert-deep' : pool.level === 'low' ? 'text-amber-600' : 'text-ink'

  return (
    <SectionCard title={t('sa.pool.title', lang)}>
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t('sa.pool.remaining', lang)} value={String(pool.balance)} valueClass={balanceTone} />
        <Stat label={t('sa.pool.bought', lang)} value={String(pool.bought)} />
        <Stat label={t('sa.pool.sent', lang)} value={String(pool.sent)} />
      </div>

      {pool.level !== 'ok' && (
        <p className={`mt-3 text-xs font-semibold ${pool.level === 'empty' ? 'text-alert-deep' : 'text-amber-600'}`}>
          {t(pool.level === 'empty' ? 'sa.pool.empty' : 'sa.pool.low', lang)}
        </p>
      )}

      <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-4">
        <div>
          <label className="text-xs font-semibold text-muted">{t('sa.pool.qty', lang)}</label>
          <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required className={input} />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted">{t('sa.pool.cost', lang)}</label>
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-muted">{t('sa.sms.note', lang)}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </div>
        <button type="submit" disabled={pending} className={`${btn} sm:col-span-4`}>
          {done ? t('sa.pool.bought_ok', lang) : t('sa.pool.buy', lang)}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
    </SectionCard>
  )
}

function Stat({ label, value, valueClass = 'text-ink' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-line/70 bg-paper-muted px-3 py-2">
      <div className="text-[11px] font-semibold text-muted">{label}</div>
      <div className={`text-lg font-extrabold ${valueClass}`}>{value}</div>
    </div>
  )
}
