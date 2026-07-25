'use client'

import { useState } from 'react'
import { t, type Lang } from '@/lib/i18n'

// 7-day expiry reminder banner under the nav (issue #169), owner + staff. Shown
// when the subscription is still active/trial but within 7 days of lapsing.
// Whether to render at all is decided server-side (the layout skips it when the
// dismiss cookie already matches this expiry); Dismiss just sets that cookie and
// hides locally, so it never reappears for this window and there's no flash.
export const SUB_REMINDER_COOKIE = 'sub-reminder-dismissed'

export function SubscriptionBanner({
  daysLeft,
  expiry,
  lang,
}: {
  daysLeft: number
  expiry: string
  lang: Lang
}) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  const message = daysLeft === 0 ? t('sub.reminder.today', lang) : `${daysLeft} ${t('sub.reminder.days', lang)}`

  return (
    <div className="flex items-center gap-3 border-b border-sun/40 bg-sun-soft px-4 py-2 text-sm text-sun-deep">
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => {
          document.cookie = `${SUB_REMINDER_COOKIE}=${expiry};path=/;max-age=${60 * 60 * 24 * 30}`
          setHidden(true)
        }}
        className="shrink-0 cursor-pointer rounded-full px-3 py-1 text-xs font-semibold hover:bg-sun/20"
      >
        {t('sub.reminder.dismiss', lang)}
      </button>
    </div>
  )
}
