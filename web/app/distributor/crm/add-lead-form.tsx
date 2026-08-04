'use client'

import { useState, useTransition } from 'react'
import { createLead } from './actions'

const input =
  'h-10 w-full rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'

export function AddLeadForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-2 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const res = await createLead(data)
          if (res.error) setError(res.error)
          else form.reset()
        })
      }}
    >
      <input name="school_name" required placeholder="School name" className={input} />
      <input name="contact_name" placeholder="Contact" className={input} />
      <input name="contact_phone" placeholder="Phone" className={input} />
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        Add lead
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}
