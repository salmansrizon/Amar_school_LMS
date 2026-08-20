'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { LocationRow } from '@/lib/locations'
import { selectClass } from '@/components/ui/field'
import { LocationPicker } from '@/components/location-picker'
import { t, type Lang } from '@/lib/i18n'
import { assignClusterDistributor, removeClusterAssignment, renameCluster, setSchoolCluster } from './actions'
import { addCluster } from '../locations/actions'

const input = 'h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const btn = 'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const ghost = 'h-9 cursor-pointer rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'

export function CreateClusterForm({ locations, lang }: { locations: LocationRow[]; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // LocationPicker is controlled, so form.reset() (native, uncontrolled-only)
  // can't clear it — remount it via a fresh key instead.
  const [pickerKey, setPickerKey] = useState(0)
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
          else {
            form.reset()
            setPickerKey((k) => k + 1)
          }
        })
      }}
    >
      <input name="name" required placeholder={t('sa.clusters.name', lang)} className={input} />
      <LocationPicker key={pickerKey} locations={locations} name="location_id" lang={lang} required />
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

/** Assign or unassign this Cluster's Distributor. Conflicts (a School in this
 *  Cluster already reachable by a different Distributor) are rejected by the
 *  DB trigger (0119) and surface here as an error toast, not a silent insert —
 *  the exclusivity guarantee lives in the DB either way, this is just the
 *  friendly front door for it. */
export function AssignDistributorForm({
  clusterId,
  distributors,
  current,
  lang,
}: {
  clusterId: string
  distributors: { id: string; full_name: string | null }[]
  current: { id: string; assigneeId: string; name: string } | null
  lang: Lang
}) {
  const router = useRouter()
  const [assigneeId, setAssigneeId] = useState('')
  const [pending, startTransition] = useTransition()

  if (current) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
          {current.name}
        </span>
        <button
          type="button"
          disabled={pending}
          className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              const result = await removeClusterAssignment(current.id)
              if (result.error) {
                toast.error(result.error)
              } else {
                toast.success(t('sa.clusters.distributorUnassigned', lang))
                router.refresh()
              }
            })
          }
        >
          {t('sa.clusters.unassignDistributor', lang)}
        </button>
      </div>
    )
  }

  if (distributors.length === 0) {
    return <p className="text-xs text-muted">{t('sa.clusters.noDistributors', lang)}</p>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={selectClass()}>
        <option value="">—</option>
        {distributors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.full_name ?? d.id.slice(0, 8)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !assigneeId}
        className={btn}
        onClick={() =>
          startTransition(async () => {
            const result = await assignClusterDistributor(clusterId, assigneeId)
            if (result.error) {
              toast.error(result.error)
            } else {
              toast.success(t('sa.clusters.distributorAssigned', lang))
              setAssigneeId('')
              router.refresh()
            }
          })
        }
      >
        {t('sa.clusters.assignDistributor', lang)}
      </button>
    </div>
  )
}
