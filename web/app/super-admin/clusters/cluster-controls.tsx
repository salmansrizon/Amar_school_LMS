'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LOCATION_LABEL, type LocationRow } from '@/lib/locations'
import { selectClass } from '@/components/ui/field'
import { t, type Lang } from '@/lib/i18n'
import { renameCluster, setSchoolCluster } from './actions'
import { addCluster } from '../locations/actions'

const input = 'h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const btn = 'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const ghost = 'h-9 cursor-pointer rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'

export function CreateClusterForm({ locations, lang }: { locations: LocationRow[]; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addCluster(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <input name="name" required placeholder={t('sa.clusters.name', lang)} className={input} />
      <select name="location_id" required className={selectClass()}>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {LOCATION_LABEL[l.type][lang]} — {l.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={btn}>{t('sa.clusters.create', lang)}</button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </form>
  )
}

export function RenameClusterForm({ clusterId, name, lang }: { clusterId: string; name: string; lang: Lang }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-2">
      <input value={value} onChange={(e) => setValue(e.target.value)} className={input} />
      <button
        type="button"
        disabled={pending || !value.trim() || value.trim() === name}
        className={ghost}
        onClick={() =>
          startTransition(async () => {
            const result = await renameCluster(clusterId, value)
            if (!result.error) router.refresh()
          })
        }
      >
        {t('sa.clusters.rename', lang)}
      </button>
    </div>
  )
}

export function AssignSchoolForm({
  clusterId,
  unassigned,
  lang,
}: {
  clusterId: string
  unassigned: { id: string; name: string }[]
  lang: Lang
}) {
  const router = useRouter()
  const [schoolId, setSchoolId] = useState('')
  const [pending, startTransition] = useTransition()
  if (unassigned.length === 0) return <p className="text-xs text-muted">{t('sa.clusters.noUnassigned', lang)}</p>
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className={selectClass()}>
        <option value="">—</option>
        {unassigned.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !schoolId}
        className={btn}
        onClick={() =>
          startTransition(async () => {
            const result = await setSchoolCluster(schoolId, clusterId)
            if (!result.error) {
              setSchoolId('')
              router.refresh()
            }
          })
        }
      >
        {t('sa.clusters.assign', lang)}
      </button>
    </div>
  )
}

export function RemoveSchoolButton({ schoolId, lang }: { schoolId: string; lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          const result = await setSchoolCluster(schoolId, null)
          if (!result.error) router.refresh()
        })
      }
    >
      {t('sa.clusters.remove', lang)}
    </button>
  )
}
