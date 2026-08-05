'use client'

import { useState, useTransition } from 'react'
import { acceptAgreement } from './actions'

// Distributor-facing agreement accept (#288). Shows the current version body and
// an Accept button; hides once accepted.
export function AcceptAgreement({ version, body }: { version: number; body: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      <div className="mb-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-paper-muted p-3 text-sm text-muted">
        {body}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const data = new FormData()
          data.set('version', String(version))
          startTransition(async () => {
            setError(null)
            const res = await acceptAgreement(data)
            if (res.error) setError(res.error)
          })
        }}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Accept agreement v{version}
      </button>
      {error && <p className="mt-1 text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
