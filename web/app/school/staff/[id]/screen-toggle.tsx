'use client'

import { useState, useTransition } from 'react'
import { setScreenGrant } from '../actions'

export function ScreenToggle({
  staffUserId,
  screenKey,
  granted,
  grantedLabel,
}: {
  staffUserId: string
  screenKey: string
  granted: boolean
  grantedLabel: string
}) {
  const [on, setOn] = useState(granted)
  const [pending, startTransition] = useTransition()

  const toggle = () =>
    startTransition(async () => {
      const next = !on
      setOn(next)
      await setScreenGrant(staffUserId, screenKey, next)
    })

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      className={`flex h-7 min-w-16 items-center justify-center rounded-full px-3 text-xs font-semibold transition-colors ${
        on ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-muted'
      } ${pending ? 'opacity-60' : 'cursor-pointer'}`}
    >
      {on ? grantedLabel : '—'}
    </button>
  )
}
