'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import type { Role } from '@/lib/auth/routing'
import { redeemOwnSubscription } from '@/app/school/subscription/actions'

// Read-time "update your subscription" gate for an expired school (issue #169),
// shown in place of every /school/* page. The owner can redeem a code to lift
// the gate; staff see an informational message (no self-service).
export function SubscriptionGate({ role, lang }: { role: Role; lang: Lang }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const isOwner = role === 'school_owner'

  return (
    <div className="mx-auto mt-10 w-full max-w-md rounded-lg border border-line bg-paper p-8 text-center shadow-card">
      <div className="mb-3 flex justify-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-alert-soft text-alert-deep">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-6" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      <h1 className="text-xl font-extrabold text-ink">{t('sub.expired.title', lang)}</h1>

      {isOwner ? (
        <>
          <p className="mt-2 text-sm text-muted">{t('sub.expired.ownerMsg', lang)}</p>
          <div className="mt-5 flex flex-col gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('sub.expired.placeholder', lang)}
              className="h-10 rounded-sm border border-line-strong bg-paper px-3 text-center font-mono text-sm outline-none focus:border-brand-500"
            />
            <button
              type="button"
              disabled={pending || !code.trim()}
              className="h-10 cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              onClick={() =>
                startTransition(async () => {
                  setError(null)
                  const result = await redeemOwnSubscription(code)
                  if (result.error) setError(result.error)
                  else router.refresh()
                })
              }
            >
              {t('sub.expired.redeem', lang)}
            </button>
            {error && <p className="text-sm text-alert-deep">{error}</p>}
            <p className="mt-1 text-xs text-muted">{t('sub.expired.contactAdmin', lang)}</p>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">{t('sub.expired.staffMsg', lang)}</p>
      )}
    </div>
  )
}
