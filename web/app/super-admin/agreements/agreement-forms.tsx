'use client'

import { useState, useTransition } from 'react'
import { createAgreementVersion, deleteAgreementVersion } from './actions'

const input =
  'w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

export function AddVersionForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const res = await createAgreementVersion(data)
          if (res.error) setError(res.error)
          else form.reset()
        })
      }}
    >
      <textarea name="body" required rows={4} placeholder="Agreement text" className={input} />
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-muted">Effective from</label>
        <input type="date" name="effective_from" className={`${input} w-auto`} />
        <button
          type="submit"
          disabled={pending}
          className="ml-auto rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          Publish new version
        </button>
      </div>
      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </form>
  )
}

export function DeleteVersionButton({ version, deletable }: { version: number; deletable: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!deletable) {
    return <span className="text-xs text-muted">accepted — locked</span>
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const data = new FormData()
          data.set('version', String(version))
          startTransition(async () => {
            setError(null)
            const res = await deleteAgreementVersion(data)
            if (res.error) setError(res.error)
          })
        }}
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        Delete
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </span>
  )
}
