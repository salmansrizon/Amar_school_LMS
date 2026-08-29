'use client'

import { useState, useTransition } from 'react'

// One optimistic grant cell for the config matrices (#284 review). Shared by the
// roles×permissions and plan×features grids so the markup, optimistic revert, and
// styling live in one place. `fields` identify the row/column; the toggle manages
// the `granted` flag itself.
export function MatrixToggle({
  on: initial,
  fields,
  action,
  ariaLabel,
}: {
  on: boolean
  fields: Record<string, string>
  action: (formData: FormData) => Promise<{ error?: string }>
  ariaLabel: string
}) {
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    const d = new FormData()
    for (const [k, v] of Object.entries(fields)) d.set(k, v)
    d.set('granted', String(next))
    startTransition(async () => {
      const res = await action(d)
      if (res.error) setOn(!next) // revert
    })
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      aria-pressed={on}
      aria-label={ariaLabel}
      className={`grid size-7 place-items-center rounded-md text-sm font-bold transition disabled:opacity-50 ${
        on ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'text-line-strong hover:bg-paper-muted'
      }`}
    >
      {on ? '✓' : '·'}
    </button>
  )
}
