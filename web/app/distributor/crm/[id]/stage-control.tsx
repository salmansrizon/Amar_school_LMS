'use client'

import { useState, useTransition } from 'react'
import { setLeadStage } from '../actions'
import { LEAD_STAGE_KEYS } from '@/lib/distributor/leads'
import { ComboboxField } from '@/components/ui/combobox-field'

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
      <ComboboxField
        value={stage}
        disabled={pending}
        onValueChange={update}
        options={LEAD_STAGE_KEYS.map((s) => ({ value: s, label: s }))}
      />
      {error && <p className="mt-1 text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
