'use client'

import { useState, useTransition } from 'react'
import { childType, LOCATION_LABEL, type LocationNode, type LocationRow } from '@/lib/locations'
import { t, type Lang } from '@/lib/i18n'
import { addCluster, addLocation, deleteCluster, deleteLocation } from './actions'
import { selectClass } from '@/components/ui/field'

const smallInput =
  'h-8 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const smallBtn =
  'h-8 cursor-pointer rounded-full bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

export function AddLocationForm({ parent, lang }: { parent: LocationNode | null; lang: Lang }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const type = parent ? childType(parent.type) : 'division'
  if (!type) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-muted hover:bg-paper-muted"
      >
        + {LOCATION_LABEL[type][lang]}
      </button>
    )
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          const result = await addLocation(data)
          if (result.error) setError(result.error)
          else setOpen(false)
        })
      }}
    >
      <input type="hidden" name="parent_id" value={parent?.id ?? ''} />
      <input type="hidden" name="type" value={type} />
      <input name="name" autoFocus required placeholder={LOCATION_LABEL[type][lang]} className={smallInput} />
      <button type="submit" disabled={pending} className={smallBtn}>
        {t('common.add', lang)}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
        ✕
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </form>
  )
}

export function DeleteLocationButton({ id, lang }: { id: string; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(t('locations.confirmDelete', lang))) return
          startTransition(async () => {
            const result = await deleteLocation(id)
            setError(result.error ?? null)
          })
        }}
        className="cursor-pointer rounded-full px-2 py-0.5 text-xs text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        🗑
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </>
  )
}

export function DeleteClusterButton({ id, lang }: { id: string; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(t('locations.confirmDeleteCluster', lang))) return
          startTransition(async () => {
            const result = await deleteCluster(id)
            setError(result.error ?? null)
          })
        }}
        className="cursor-pointer rounded-full px-2 py-0.5 text-xs text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        🗑
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </>
  )
}

export function AddClusterForm({ locations, lang }: { locations: LocationRow[]; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          const result = await addCluster(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <input name="name" required placeholder={t('locations.clusterName', lang)} className={smallInput} />
      <select name="location_id" required className={selectClass({ size: 'xs' })}>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {LOCATION_LABEL[l.type][lang]} — {l.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={smallBtn}>
        {t('common.add', lang)}
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </form>
  )
}
