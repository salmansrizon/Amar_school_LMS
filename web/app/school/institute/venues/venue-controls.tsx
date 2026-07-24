'use client'

import { createContext, useContext, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import type { BuildingRow } from '@/lib/venues'
import { deleteBuilding, deleteRoom, saveBuilding, saveRoom } from './actions'
import { selectClass } from '@/components/ui/field'

// Venues tab controls (issue #93). Buildings and rooms share one add/edit form
// shape: an existing row passes its id, a new one doesn't.

// EditToggle hands its "close" down through context rather than a render-prop
// child: the Venues page is a Server Component, and a function child (or an
// onDone function prop) passed to a Client Component isn't serializable across
// the RSC boundary — it threw "Functions are not valid as a child of Client
// Components" and blanked the page (ui.md issue 3 / #149). Elements are
// serializable; the close callback travels via this client-only context.
const EditCloseContext = createContext<() => void>(() => {})

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
}: {
  lang: Lang
  building?: BuildingRow
}) {
  // Closes the surrounding EditToggle on success; a no-op for the add form.
  const close = useContext(EditCloseContext)
  const { error, pending, onSubmit } = useSubmit(saveBuilding, lang, close)
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
}: {
  lang: Lang
  buildings: BuildingRow[]
  buildingId?: string
  room?: { id: string; name: string; capacity: number; building_id: string; is_active: boolean }
}) {
  const close = useContext(EditCloseContext)
  const { error, pending, onSubmit } = useSubmit(saveRoom, lang, close)
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

/** Inline edit toggle — the row turns into its form in place. Children are
 *  plain elements (RSC-serializable); the form reads its close callback from
 *  EditCloseContext rather than a render-prop. */
export function EditToggle({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        {t('venues.edit', lang)}
      </button>
    )
  return (
    <div className="w-full rounded-md border border-line bg-paper-muted p-3">
      <EditCloseContext.Provider value={() => setOpen(false)}>{children}</EditCloseContext.Provider>
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
        className="inline-flex cursor-pointer items-center rounded-full border border-alert-deep/30 px-3 py-1 text-xs font-semibold text-alert-deep transition hover:bg-alert-soft disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-deep/30"
      >
        {t('venues.delete', lang)}
      </button>
      {error && <p className="text-xs text-alert-deep">{error}</p>}
    </>
  )
}
