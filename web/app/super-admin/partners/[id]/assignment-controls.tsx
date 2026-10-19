'use client'

import { useState, useTransition } from 'react'
import { type LocationRow } from '@/lib/locations'
import { t, type Lang } from '@/lib/i18n'
import { addAssignment, removeAssignment } from '../actions'
import { SelectField } from '@/components/ui/select-field'
import { ComboboxField } from '@/components/ui/combobox-field'
import { LocationPicker } from '@/components/location-picker'

const smallBtn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

export function AddAssignmentForm({
  assigneeId,
  isDistributor,
  locations,
  schools,
  lang,
}: {
  assigneeId: string
  isDistributor: boolean
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
      <SelectField
        value={mode}
        onValueChange={(v) => setMode(v as 'location' | 'school')}
        options={[
          { value: 'location', label: t('partners.addLocation', lang) },
          { value: 'school', label: t('partners.addSchool', lang) },
        ]}
      />

      {mode === 'location' ? (
        // Hierarchical division → district → upazila → union picker (same as
        // clusters) instead of a flat select of every location.
        <LocationPicker locations={locations} name="location_id" lang={lang} required />
      ) : (
        <ComboboxField name="school_id" required options={schools.map((s) => ({ value: s.id, label: s.name }))} />
      )}

      {isDistributor && mode === 'location' && (
        <SelectField
          name="tier"
          options={[
            { value: '', label: `${t('partners.tier', lang)} —` },
            { value: 'division', label: 'Division' },
            { value: 'zilla', label: 'Zilla' },
            { value: 'upazila', label: 'Upazila' },
            { value: 'union', label: 'Union' },
          ]}
        />
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
