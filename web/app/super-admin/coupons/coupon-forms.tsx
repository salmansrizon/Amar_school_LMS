'use client'

import { useState, useTransition } from 'react'
import { createCoupon, setCouponActive, deleteCoupon } from './actions'

const input = 'h-10 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'

export function AddCouponForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-2 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const res = await createCoupon(data)
          if (res.error) setError(res.error)
          else form.reset()
        })
      }}
    >
      <input name="code" required placeholder="CODE" className={`${input} uppercase`} />
      <select name="discount_type" required defaultValue="percent" className={input}>
        <option value="percent">Percent %</option>
        <option value="flat">Flat ৳</option>
      </select>
      <input name="value" required placeholder="Value" className={input} />
      <input type="date" name="expires_at" className={input} title="Expires (optional)" />
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        Add coupon
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-5">{error}</p>}
    </form>
  )
}

export function CouponRowActions({ code, active }: { code: string; active: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (fn: (d: FormData) => Promise<{ error?: string }>, extra?: Record<string, string>) => {
    const data = new FormData()
    data.set('code', code)
    for (const [k, v] of Object.entries(extra ?? {})) data.set(k, v)
    startTransition(async () => {
      setError(null)
      const res = await fn(data)
      if (res.error) setError(res.error)
    })
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => run(setCouponActive, { active: String(!active) })}
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
      >
        {active ? 'Deactivate' : 'Activate'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(deleteCoupon)}
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        Delete
      </button>
    </span>
  )
}
