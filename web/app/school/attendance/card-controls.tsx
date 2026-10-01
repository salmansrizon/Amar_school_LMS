'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { setAutomaticAttendance } from './actions'

// Per-school manual-attendance override switch (issue #30, PRD §5.3): the
// legacy "de-activate automatic attendance" toggle. Optimistic-immediate
// save like ShiftToggle (app/school/employees/employee-controls.tsx), reverts on error.
export function AutomaticAttendanceToggle({ enabled, lang }: { enabled: boolean; lang: Lang }) {
  const [on, setOn] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        aria-pressed={on}
        onClick={() =>
          startTransition(async () => {
            const next = !on
            setOn(next)
            setError(null)
            const result = await setAutomaticAttendance(next)
            if (result.error) {
              setOn(!next)
              setError(result.error)
            }
          })
        }
        className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
          on ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-muted'
        } ${pending ? 'opacity-60' : ''}`}
      >
        {t(on ? 'attendance.automaticEnabled' : 'attendance.automaticDisabled', lang)}
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </div>
  )
}
