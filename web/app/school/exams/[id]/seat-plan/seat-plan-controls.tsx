'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { countRollsInRange, exceedsCapacity, overlappingRowIds } from '@/lib/exam-setup'
import { t, type Lang } from '@/lib/i18n'
import { generateSeatPlan, publishSeatPlan, removeSeatPlanRow, saveSeatPlanRow } from './actions'

export interface RoomOption {
  id: string
  name: string
  capacity: number
}

export interface SeatPlanRow {
  id: string
  room_id: string
  roll_start: number
  roll_end: number
}

export function SeatPlanTable({
  examId,
  rows,
  rooms,
  rolls,
  disabled,
  lang,
}: {
  examId: string
  rows: SeatPlanRow[]
  rooms: RoomOption[]
  rolls: number[]
  disabled: boolean
  lang: Lang
}) {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const overlapping = overlappingRowIds(rows)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-160 text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold text-muted">
            <th className="py-2 pr-2">{t('seatPlan.room', lang)}</th>
            <th className="py-2 pr-2 text-right">{t('seatPlan.capacity', lang)}</th>
            <th className="py-2 pr-2">{t('seatPlan.rollRange', lang)}</th>
            <th className="py-2 pr-2 text-right">{t('seatPlan.studentCount', lang)}</th>
            <th className="py-2 pr-2">{t('seatPlan.status', lang)}</th>
            {!disabled && <th className="py-2 text-right">{t('seatPlan.delete', lang)}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => {
            const room = roomById.get(row.room_id)
            return (
              <SeatPlanRowView
                key={row.id}
                examId={examId}
                row={row}
                room={room}
                studentCount={countRollsInRange(rolls, row)}
                isOverlap={overlapping.has(row.id)}
                isOverCapacity={room ? exceedsCapacity(row, room.capacity) : false}
                disabled={disabled}
                lang={lang}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SeatPlanRowView({
  examId,
  row,
  room,
  studentCount,
  isOverlap,
  isOverCapacity,
  disabled,
  lang,
}: {
  examId: string
  row: SeatPlanRow
  room: RoomOption | undefined
  studentCount: number
  isOverlap: boolean
  isOverCapacity: boolean
  disabled: boolean
  lang: Lang
}) {
  const bad = isOverlap || isOverCapacity
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <tr>
      <td className="py-2 pr-2 font-medium">{room?.name ?? '—'}</td>
      <td className="py-2 pr-2 text-right">{room?.capacity ?? '—'}</td>
      <td className="py-2 pr-2">
        {disabled ? (
          `${row.roll_start} – ${row.roll_end}`
        ) : (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              const data = new FormData(e.currentTarget)
              data.set('room_id', row.room_id)
              startTransition(async () => {
                setError(null)
                const result = await saveSeatPlanRow(examId, data)
                if (result.error) setError(result.error)
                else router.refresh()
              })
            }}
          >
            <input
              name="roll_start"
              type="number"
              min={1}
              defaultValue={row.roll_start}
              aria-label={t('seatPlan.rollStart', lang)}
              className={`${inputClass} h-8 w-16`}
            />
            <span>–</span>
            <input
              name="roll_end"
              type="number"
              min={1}
              defaultValue={row.roll_end}
              aria-label={t('seatPlan.rollEnd', lang)}
              className={`${inputClass} h-8 w-16`}
            />
            <button
              type="submit"
              disabled={pending}
              className="cursor-pointer rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              ✓
            </button>
          </form>
        )}
        {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
      </td>
      <td className="py-2 pr-2 text-right">{studentCount}</td>
      <td className="py-2 pr-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            bad ? 'bg-alert-soft text-alert-deep' : 'bg-mint-soft text-mint-deep'
          }`}
        >
          {isOverlap ? t('seatPlan.overlap', lang) : isOverCapacity ? t('seatPlan.overCapacity', lang) : t('seatPlan.ok', lang)}
        </span>
      </td>
      {!disabled && (
        <td className="py-2 text-right">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                setError(null)
                const result = await removeSeatPlanRow(examId, row.id)
                if (result.error) setError(result.error)
                else router.refresh()
              })
            }}
            className="cursor-pointer rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold hover:bg-paper-muted"
          >
            ✕
          </button>
        </td>
      )}
    </tr>
  )
}

export function AddSeatPlanRowForm({ examId, rooms, lang }: { examId: string; rooms: RoomOption[]; lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await saveSeatPlanRow(examId, data)
          if (result.error) setError(result.error)
          else {
            form.reset()
            router.refresh()
          }
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="room_id">{t('seatPlan.room', lang)}</label>
        <select id="room_id" name="room_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            {t('seatPlan.pickRoom', lang)}
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.capacity})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="roll_start">{t('seatPlan.rollStart', lang)}</label>
        <input id="roll_start" name="roll_start" type="number" min={1} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="roll_end">{t('seatPlan.rollEnd', lang)}</label>
        <input id="roll_end" name="roll_end" type="number" min={1} required className={inputClass} />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={pending} className={primaryBtnClass}>
          {t('seatPlan.addRow', lang)}
        </button>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}

export function GenerateButton({ examId, lang }: { examId: string; lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(t('seatPlan.generateConfirm', lang))) return
          startTransition(async () => {
            setError(null)
            const result = await generateSeatPlan(examId)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }}
        className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted disabled:opacity-50"
      >
        {t('seatPlan.generate', lang)}
      </button>
    </span>
  )
}

export function PublishButton({
  examId,
  hasConflict,
  published,
  lang,
}: {
  examId: string
  hasConflict: boolean
  published: boolean
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const disabled = pending || hasConflict || published

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      {published && (
        <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
          {t('seatPlan.published', lang)}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        title={hasConflict ? t('seatPlan.cannotPublish', lang) : undefined}
        onClick={() => {
          startTransition(async () => {
            setError(null)
            const result = await publishSeatPlan(examId)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }}
        className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('seatPlan.publish', lang)}
      </button>
    </span>
  )
}
