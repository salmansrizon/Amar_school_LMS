'use client'

import { useState, useTransition } from 'react'
import { expiryAfterDecrease, type SubscriptionStatus } from '@/lib/subscription'
import { t, type Lang } from '@/lib/i18n'
import { decreaseExpiry, redeemCode } from '../codes/actions'

const input =
  'h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

export function SchoolSubscriptionControls({
  schoolId,
  expiry,
  status,
  lang,
}: {
  schoolId: string
  expiry: string | null
  status: SubscriptionStatus
  lang: Lang
}) {
  const [code, setCode] = useState('')
  const [months, setMonths] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const decreasePreview =
    status === 'active' && expiry
      ? expiryAfterDecrease(new Date(expiry + 'T00:00:00Z'), months).toISOString().slice(0, 10)
      : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('schools.redeemPlaceholder', lang)}
          className={`${input} font-mono`}
        />
        <button
          type="button"
          disabled={pending || !code.trim()}
          className={btn}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await redeemCode(schoolId, code)
              if (result.error) setError(result.error)
              else setCode('')
            })
          }
        >
          {t('schools.redeem', lang)}
        </button>
      </div>

      {/* Decrease expiry: only offered when a real, active expiry exists (issue #6). */}
      {status === 'active' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-muted">{t('schools.decrease', lang)}</label>
          <input
            type="number"
            min={1}
            max={24}
            value={months}
            onChange={(e) => setMonths(Math.max(1, Number(e.target.value)))}
            className={`${input} w-20`}
          />
          {decreasePreview && (
            <span className="text-xs text-muted">
              {t('schools.newExpiry', lang)}: {decreasePreview}
            </span>
          )}
          <button
            type="button"
            disabled={pending}
            className="h-9 cursor-pointer rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = await decreaseExpiry(schoolId, months)
                if (result.error) setError(result.error)
              })
            }
          >
            {t('schools.apply', lang)}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
