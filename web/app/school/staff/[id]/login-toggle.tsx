'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { setStaffLoginDisabled } from '../actions'

const btn =
  'inline-flex cursor-pointer items-center rounded-full border px-4 py-1.5 text-xs font-semibold disabled:opacity-50'

/** Turn one Staff login off (with a confirm) or back on (#688). Rendered only
 *  when the state is readable, i.e. once migration 0241 is applied. */
export function LoginToggle({ staffUserId, disabled, lang }: { staffUserId: string; disabled: boolean; lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (disabled) {
    return (
      <div className="rounded-md bg-sun-soft px-3 py-2 text-sm text-sun-deep">
        <p className="mb-2">{t('staff.loginDisabledNote', lang)}</p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await setStaffLoginDisabled(staffUserId, false)
              if (res.error) setError(res.error)
              else router.refresh()
            })
          }
          className={`${btn} border-line-strong bg-paper text-ink hover:bg-paper-muted`}
        >
          {t('staff.enableLogin', lang)}
        </button>
        {error && <p className="mt-2 text-xs text-alert-deep">{error}</p>}
      </div>
    )
  }

  return (
    <ConfirmDialog
      triggerLabel={t('staff.disableLogin', lang)}
      triggerClassName={`${btn} border-alert text-alert-deep hover:bg-alert-soft`}
      title={t('staff.disableLogin', lang)}
      body={t('staff.disableLoginConfirm', lang)}
      confirmLabel={t('staff.disableLogin', lang)}
      cancelLabel={t('routine.cancel', lang)}
      onConfirm={async () => {
        const res = await setStaffLoginDisabled(staffUserId, true)
        if (!res.error) router.refresh()
        return res
      }}
    />
  )
}
