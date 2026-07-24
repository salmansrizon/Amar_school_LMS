'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import type { BuildingRow } from '@/lib/venues'
import { deleteBuilding, deleteRoom, saveBuilding, saveRoom } from './actions'
import { selectClass } from '@/components/ui/field'

// Venues tab controls (issue #93). Buildings and rooms share one add/edit form
// shape: an existing row passes its id, a new one doesn't.

const ERROR_KEYS: Record<string, MessageKey> = {
  buildingNameRequired: 'venues.errBuildingNameRequired',
  buildingNameDuplicate: 'venues.errBuildingNameDuplicate',
  roomNameRequired: 'venues.errRoomNameRequired',
  roomBuildingRequired: 'venues.errRoomBuildingRequired',
  roomCapacityInvalid: 'venues.errRoomCapacityInvalid',
  roomNameDuplicate: 'venues.errRoomNameDuplicate',
}

function useSubmit(action: (data: FormData) => Promise<{ error?: string }>, lang: Lang, done?: () => void) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      setError(null)
      const result = await action(data)
      if (result.error) {
        setError(result.error in ERROR_KEYS ? t(ERROR_KEYS[result.error], lang) : result.error)
        return
      }
      form.reset()
      done?.()
      router.refresh()
    })
  }
  return { error, pending, onSubmit }
}

export function BuildingForm({
  lang,
  building,
  onDone,
}: {
  lang: Lang
  building?: BuildingRow
  onDone?: () => void
}) {
  const { error, pending, onSubmit } = useSubmit(saveBuilding, lang, onDone)
  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={onSubmit}>
      {building && <input type="hidden" name="id" value={building.id} />}
      <div>
        <label className={labelClass} htmlFor={`building_name_${building?.id ?? 'new'}`}>
          {t('venues.buildingName', lang)}
        </label>
        <input
          id={`building_name_${building?.id ?? 'new'}`}
          name="name"
          required
          defaultValue={building?.name ?? ''}
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={`${primaryBtnClass} w-auto px-5`}>
        {t(building ? 'venues.save' : 'venues.addBuilding', lang)}
      </button>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
    </form>
  )
}

export function RoomForm({
  lang,
  buildings,
  buildingId,
  room,
  onDone,
}: {
  lang: Lang
  buildings: BuildingRow[]
  buildingId?: string
  room?: { id: string; name: string; capacity: number; building_id: string; is_active: boolean }
  onDone?: () => void
}) {
  const { error, pending, onSubmit } = useSubmit(saveRoom, lang, onDone)
  const key = room?.id ?? `new_${buildingId ?? ''}`
  return (
    <form className="grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={onSubmit}>
      {room && <input type="hidden" name="id" value={room.id} />}
      <div>
        <label className={labelClass} htmlFor={`room_name_${key}`}>
          {t('venues.roomName', lang)}
        </label>
        <input
          id={`room_name_${key}`}
          name="name"
          required
          defaultValue={room?.name ?? ''}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`room_capacity_${key}`}>
          {t('venues.capacity', lang)}
        </label>
        <input
          id={`room_capacity_${key}`}
          name="capacity"
          type="number"
          min={1}
          required
          defaultValue={room?.capacity ?? ''}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`room_building_${key}`}>
          {t('venues.building', lang)}
        </label>
        <select
          id={`room_building_${key}`}
          name="building_id"
          defaultValue={room?.building_id ?? buildingId ?? ''}
          className={selectClass({ size: 'md', fullWidth: true })}
        >
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`room_active_${key}`}>
          {t('venues.status', lang)}
        </label>
        <select
          id={`room_active_${key}`}
          name="is_active"
          defaultValue={String(room?.is_active ?? true)}
          className={selectClass({ size: 'md', fullWidth: true })}
        >
          <option value="true">{t('venues.active', lang)}</option>
          <option value="false">{t('venues.inactive', lang)}</option>
        </select>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-4`}>
        {t(room ? 'venues.save' : 'venues.addRoom', lang)}
      </button>
    </form>
  )
}

/** Inline edit toggle — the row turns into its form in place. */
export function EditToggle({ lang, children }: { lang: Lang; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer text-xs font-semibold text-brand-600 hover:underline"
      >
        {t('venues.edit', lang)}
      </button>
    )
  return (
    <div className="rounded-md border border-line bg-paper-muted p-3">
      {children(() => setOpen(false))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 cursor-pointer text-xs font-semibold text-muted hover:underline"
      >
        {t('venues.cancel', lang)}
      </button>
    </div>
  )
}

export function DeleteVenueButton({
  lang,
  kind,
  id,
  roomCount = 0,
}: {
  lang: Lang
  kind: 'building' | 'room'
  id: string
  roomCount?: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const onClick = () => {
    // Deleting a building cascades to its rooms — say so before it happens.
    const message =
      kind === 'building'
        ? roomCount > 0
          ? `${t('venues.confirmDeleteBuilding', lang)} (${roomCount})`
          : t('venues.confirmDeleteBuilding', lang)
        : t('venues.confirmDeleteRoom', lang)
    if (!window.confirm(message)) return
    startTransition(async () => {
      const res = kind === 'building' ? await deleteBuilding(id) : await deleteRoom(id)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="cursor-pointer text-xs font-semibold text-alert-deep hover:underline disabled:opacity-50"
      >
        {t('venues.delete', lang)}
      </button>
      {error && <p className="text-xs text-alert-deep">{error}</p>}
    </>
  )
}
