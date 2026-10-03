'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { dateToDayOfWeek, sortRoutineEntries } from '@/lib/exam-setup'
import { dayLabel } from '@/lib/routine'
import { toast } from 'sonner'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { addRoutineEntry, removeRoutineEntry, type RoutineEntryRefusal } from './actions'

const REFUSAL: Record<RoutineEntryRefusal, MessageKey> = {
  required: 'examRoutine.errRequired',
  timeOrder: 'examRoutine.errTimeOrder',
  overlap: 'examRoutine.errOverlap',
}
import { dateInputClass } from '@/components/ui/field'
import { ComboboxField } from '@/components/ui/combobox-field'

export interface Option {
  id: string
  label: string
}

export interface RoutineEntryRow {
  id: string
  subject_id: string
  exam_date: string
  start_time: string
  end_time: string
  room_id: string | null
}

export function RoutineTable({
  examId,
  entries,
  subjects,
  rooms,
  disabled,
  lang,
}: {
  examId: string
  entries: RoutineEntryRow[]
  subjects: Option[]
  rooms: Option[]
  disabled: boolean
  lang: Lang
}) {
  const subjectName = new Map(subjects.map((s) => [s.id, s.label]))
  const roomName = new Map(rooms.map((r) => [r.id, r.label]))
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const sorted = sortRoutineEntries(entries)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-160 text-sm">
        <thead className="bg-paper-muted">
          <tr className="text-left text-sm text-muted">
            <th className="px-4 py-3">{t('examRoutine.date', lang)}</th>
            <th className="px-4 py-3">{t('examRoutine.day', lang)}</th>
            <th className="px-4 py-3">{t('examRoutine.time', lang)}</th>
            <th className="px-4 py-3">{t('examRoutine.subject', lang)}</th>
            <th className="px-4 py-3">{t('examRoutine.room', lang)}</th>
            {!disabled && <th className="px-4 py-3 text-right">{t('examRoutine.delete', lang)}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3">{e.exam_date}</td>
              <td className="px-4 py-3">{dayLabel(dateToDayOfWeek(e.exam_date), lang)}</td>
              <td className="px-4 py-3">
                {e.start_time.slice(0, 5)} - {e.end_time.slice(0, 5)}
              </td>
              <td className="px-4 py-3">{subjectName.get(e.subject_id) ?? '—'}</td>
              <td className="px-4 py-3">{e.room_id ? (roomName.get(e.room_id) ?? '—') : '—'}</td>
              {!disabled && (
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        setError(null)
                        const result = await removeRoutineEntry(examId, e.id)
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
          ))}
        </tbody>
      </table>
      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
    </div>
  )
}

export function AddRoutineEntryForm({
  examId,
  subjects,
  rooms,
  lang,
}: {
  examId: string
  subjects: Option[]
  rooms: Option[]
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addRoutineEntry(examId, data)
          if (result.refused) setError(t(REFUSAL[result.refused], lang))
          else if (result.error) setError(result.error)
          else {
            toast.success(t('examRoutine.added', lang))
            form.reset()
            router.refresh()
          }
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="exam_date">{t('examRoutine.date', lang)}</label>
        <input id="exam_date" name="exam_date" type="date" required className={dateInputClass({ size: 'md', fullWidth: true })} />
      </div>
      <div>
        <label className={labelClass} htmlFor="start_time">{t('examRoutine.startTime', lang)}</label>
        <input id="start_time" name="start_time" type="time" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="end_time">{t('examRoutine.endTime', lang)}</label>
        <input id="end_time" name="end_time" type="time" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="subject_id">{t('examRoutine.subject', lang)}</label>
        <ComboboxField
          id="subject_id"
          name="subject_id"
          required
          defaultValue=""
          options={[
            { value: '', label: t('examRoutine.pickSubject', lang), disabled: true },
            ...subjects.map((s) => ({ value: s.id, label: s.label })),
          ]}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="room_id">{t('examRoutine.room', lang)}</label>
        <ComboboxField
          id="room_id"
          name="room_id"
          defaultValue=""
          options={[
            { value: '', label: t('examRoutine.pickRoom', lang) },
            ...rooms.map((r) => ({ value: r.id, label: r.label })),
          ]}
        />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-5">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-5`}>
        {t('examRoutine.addEntry', lang)}
      </button>
    </form>
  )
}
