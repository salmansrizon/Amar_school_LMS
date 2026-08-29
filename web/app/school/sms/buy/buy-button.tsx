'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { t, type Lang } from '@/lib/i18n'
import { buySmsPackage } from './actions'
import { useRef } from 'react'

export function BuyButton({ packageId, lang }: { packageId: string; lang: Lang }) {
  const { error, pending, run } = useCrudAction(buySmsPackage)
  const idempotencyKey = useRef<string | undefined>(undefined)
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const d = new FormData()
          d.set('package_id', packageId)
          idempotencyKey.current ??= crypto.randomUUID()
          d.set('idempotency_key', idempotencyKey.current)
          run(d, () => {
            idempotencyKey.current = undefined
          })
        }}
        className="w-full rounded-lg bg-brand-600 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('sms.buy', lang)}
      </button>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}
