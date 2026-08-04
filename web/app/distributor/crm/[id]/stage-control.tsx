'use client'

import { useState, useTransition } from 'react'
import { setLeadStage } from '../actions'
import { LEAD_STAGE_KEYS } from '@/lib/distributor/leads'

export function StageControl({ id, current }: { id: string; current: string }) {
  const [stage, setStage] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function update(next: string) {
    setStage(next)
    const data = new FormData()
    data.set('id', id)
    data.set('stage', next)
    startTransition(async () => {
      setError(null)
      const res = await setLeadStage(data)
      if (res.error) {
        setError(res.error)
        setStage(current)
      }
    })
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted">Stage</label>
      <select
        value={stage}
        disabled={pending}
        onChange={(e) => update(e.target.value)}
        className="h-10 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-50"
      >
        {LEAD_STAGE_KEYS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
