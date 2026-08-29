'use client'

import { useState, useTransition } from 'react'
import { setTaskStatus } from '../actions'

export function TaskToggle({ id, status }: { id: string; status: string }) {
  const [current, setCurrent] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = current === 'done' ? 'open' : 'done'
    setCurrent(next)
    const data = new FormData()
    data.set('id', id)
    data.set('status', next)
    startTransition(async () => {
      setError(null)
      const res = await setTaskStatus(data)
      if (res.error) {
        setError(res.error)
        setCurrent(current)
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`h-10 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50 ${current === 'done' ? 'bg-muted hover:bg-ink' : 'bg-brand-500 hover:bg-brand-600'}`}
      >
        {current === 'done' ? 'Reopen task' : 'Mark done'}
      </button>
      {error && <p className="mt-1 text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
