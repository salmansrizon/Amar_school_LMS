'use client'

import { useState, useTransition } from 'react'
import { useCrudAction } from '@/lib/crud/use-crud-action'
import { upsertTemplate, deleteTemplate, addChannelRoute, removeChannelRoute } from './actions'

const input = 'w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

export function TemplateForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const res = await upsertTemplate(data)
          if (res.error) setError(res.error)
          else form.reset()
        })
      }}
    >
      <input name="key" required placeholder="template_key" className={`${input} sm:col-span-2 font-mono`} />
      <input name="title_en" placeholder="Title (EN)" className={input} />
      <input name="title_bn" placeholder="শিরোনাম (BN)" className={input} />
      <textarea name="body_en" rows={2} placeholder="Body (EN) — use {{placeholders}}" className={`${input} sm:col-span-1`} />
      <textarea name="body_bn" rows={2} placeholder="বার্তা (BN)" className={`${input} sm:col-span-1`} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          Save template
        </button>
        <span className="text-xs text-muted">Existing key updates in place.</span>
        {error && <span className="text-sm text-alert-deep">{error}</span>}
      </div>
    </form>
  )
}

export function DeleteTemplateButton({ templateKey }: { templateKey: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const data = new FormData()
          data.set('key', templateKey)
          startTransition(async () => {
            setError(null)
            const res = await deleteTemplate(data)
            if (res.error) setError(res.error)
          })
        }}
        className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        Delete
      </button>
    </span>
  )
}

export function ChannelRouteForm({ templateKeys }: { templateKeys: string[] }) {
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
          const res = await addChannelRoute(data)
          if (res.error) setError(res.error)
          else form.reset()
        })
      }}
    >
      <input name="event_type" required placeholder="EventType" className={input} />
      <select name="channel" defaultValue="in_app" className={input}>
        <option value="in_app">in_app</option>
        <option value="sms">sms</option>
        <option value="email">email</option>
      </select>
      <select name="template_key" required defaultValue="" className={input}>
        <option value="" disabled>
          template…
        </option>
        {templateKeys.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        Add route
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}

export function RemoveRouteButton({ eventType, channel }: { eventType: string; channel: string }) {
  const { error, pending, run } = useCrudAction(removeChannelRoute)
  return (
    <button
      type="button"
      disabled={pending}
      title={error ?? undefined}
      onClick={() => {
        const data = new FormData()
        data.set('event_type', eventType)
        data.set('channel', channel)
        run(data)
      }}
      className={`text-xs font-semibold hover:underline disabled:opacity-50 ${error ? 'text-alert' : 'text-alert-deep'}`}
    >
      ✕
    </button>
  )
}
