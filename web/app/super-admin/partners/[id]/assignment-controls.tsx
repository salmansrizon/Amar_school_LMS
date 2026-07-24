'use client'

import { useState, useTransition } from 'react'
import { LOCATION_LABEL, type LocationRow } from '@/lib/locations'
import { t, type Lang } from '@/lib/i18n'
import { addAssignment, removeAssignment } from '../actions'
import { selectClass } from '@/components/ui/field'

const smallBtn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

export function AddAssignmentForm({
  assigneeId,
  isDealer,
  locations,
  schools,
  lang,
}: {
  assigneeId: string
  isDealer: boolean
  locations: LocationRow[]
  schools: { id: string; name: string }[]
  lang: Lang
}) {
  const [mode, setMode] = useState<'location' | 'school'>('location')
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
          setError(null)
          const result = await addAssignment(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <input type="hidden" name="assignee_id" value={assigneeId} />
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as 'location' | 'school')}
        className={selectClass()}
      >
        <option value="location">{t('partners.addLocation', lang)}</option>
        <option value="school">{t('partners.addSchool', lang)}</option>
      </select>

      {mode === 'location' ? (
        <select name="location_id" required className={selectClass()}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {LOCATION_LABEL[l.type][lang]} — {l.name}
            </option>
          ))}
        </select>
      ) : (
        <select name="school_id" required className={selectClass()}>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {isDealer && mode === 'location' && (
        <select name="tier" className={selectClass()}>
          <option value="">{t('partners.tier', lang)} —</option>
          <option value="division">Division</option>
          <option value="zilla">Zilla</option>
          <option value="upazila">Upazila</option>
          <option value="union">Union</option>
        </select>
      )}

      <button type="submit" disabled={pending} className={smallBtn}>
        {t('common.add', lang)}
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </form>
  )
}

export function RemoveAssignmentButton({
  id,
  assigneeId,
  label,
}: {
  id: string
  assigneeId: string
  label: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeAssignment(id, assigneeId)
            setError(result.error ?? null)
          })
        }
        className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        {label}
      </button>
    </span>
  )
}
