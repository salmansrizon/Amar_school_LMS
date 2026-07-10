'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { setSlot, publishRoutine } from './actions'

export interface Option {
  id: string
  label: string
}

interface CellState {
  subject_id: string | null
  teacher_id: string | null
  room_id: string | null
}

const selectClass =
  'w-full rounded-md border border-line-strong bg-paper px-1.5 py-1 text-xs focus:border-brand-500 focus:outline-none'

function labelOf(options: Option[], id: string | null): string | null {
  if (!id) return null
  return options.find((o) => o.id === id)?.label ?? null
}

export function SlotCell({
  classId,
  day,
  period,
  slot,
  subjects,
  teachers,
  rooms,
  lang,
}: {
  classId: string
  day: number
  period: number
  slot: CellState | null
  subjects: Option[]
  teachers: Option[]
  rooms: Option[]
  lang: Lang
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const subjectName = labelOf(subjects, slot?.subject_id ?? null)
  const teacherName = labelOf(teachers, slot?.teacher_id ?? null)
  const roomName = labelOf(rooms, slot?.room_id ?? null)
  const isSet = Boolean(slot?.subject_id || slot?.teacher_id || slot?.room_id)

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null)
          setEditing(true)
        }}
        className="flex h-full min-h-14 w-full cursor-pointer flex-col items-start gap-0.5 rounded-md p-1.5 text-left text-xs hover:bg-paper-muted"
      >
        {isSet ? (
          <>
            <span className="font-semibold">{subjectName ?? '—'}</span>
            {(teacherName || roomName) && (
              <span className="text-muted">{[teacherName, roomName].filter(Boolean).join(' · ')}</span>
            )}
          </>
        ) : (
          <span className="text-muted">＋</span>
        )}
      </button>
    )
  }

  return (
    <form
      className="flex flex-col gap-1 p-1"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        data.set('class_id', classId)
        data.set('day_of_week', String(day))
        data.set('period', String(period))
        startTransition(async () => {
          setError(null)
          const result = await setSlot(data)
          if (result.error) setError(result.error)
          else setEditing(false)
        })
      }}
    >
      <select
        name="subject_id"
        defaultValue={slot?.subject_id ?? ''}
        className={selectClass}
        aria-label={t('routine.subject', lang)}
      >
        <option value="">{t('routine.subject', lang)}</option>
        {subjects.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        name="teacher_id"
        defaultValue={slot?.teacher_id ?? ''}
        className={selectClass}
        aria-label={t('routine.teacher', lang)}
      >
        <option value="">{t('routine.teacher', lang)}</option>
        {teachers.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        name="room_id"
        defaultValue={slot?.room_id ?? ''}
        className={selectClass}
        aria-label={t('routine.room', lang)}
      >
        <option value="">{t('routine.room', lang)}</option>
        {rooms.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Conflicts (teacher/room double-booked) come back from the DB's unique
          indexes and surface here in red, per the mockup's conflict styling. */}
      {error && <span className="text-[11px] text-alert-deep">{error}</span>}
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 cursor-pointer rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {t('routine.save', lang)}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="cursor-pointer rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-semibold"
        >
          ✕
        </button>
      </div>
    </form>
  )
}

export function PublishButton({
  classId,
  publishedAt,
  lang,
}: {
  classId: string
  publishedAt: string | null
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          publishedAt ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-muted'
        }`}
      >
        {publishedAt ? t('routine.published', lang) : t('routine.draft', lang)}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await publishRoutine(classId)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }
        className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('routine.publish', lang)}
      </button>
    </span>
  )
}

/** Class dropdown: picking a class navigates to `${basePath}?class=<id>` — the
 *  routine grid by default; reused as-is by subject assignment (issue #46). */
export function ClassPicker({
  classes,
  selected,
  lang,
  basePath = '/school/classes/routine',
  pickLabelKey = 'routine.pickClass',
}: {
  classes: { id: string; name: string; section: string | null }[]
  selected: string
  lang: Lang
  basePath?: string
  pickLabelKey?: 'routine.pickClass' | 'subjects.pickClass'
}) {
  const router = useRouter()
  return (
    <select
      value={selected}
      onChange={(e) => router.push(`${basePath}?class=${e.target.value}`)}
      className="min-w-40 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
      aria-label={t(pickLabelKey, lang)}
    >
      <option value="" disabled>
        {t(pickLabelKey, lang)}
      </option>
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.section ? ` - ${c.section}` : ''}
        </option>
      ))}
    </select>
  )
}
