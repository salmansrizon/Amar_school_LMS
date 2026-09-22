'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { addOffDay, deleteOffDay, importCentralOffDays, updateWeeklyOffDays } from '../manual-actions'
import { dateInputClass } from '@/components/ui/field'

// Sun-first (0..6), matching monthGrid's own week start and
// dayOffInfo's Date.getUTCDay() convention.
const WEEKDAY_KEYS = [
  'attendance.weekdaySun',
  'attendance.weekdayMon',
  'attendance.weekdayTue',
  'attendance.weekdayWed',
  'attendance.weekdayThu',
  'attendance.weekdayFri',
  'attendance.weekdaySat',
] as const

/** The Regular Weekly Off-Day picker (issue #665, ADR 0027): a plain
 *  checkbox per weekday, submitting the whole set on save. Replaces the old
 *  hardcoded Saturday-only rule — saving always REPLACES the School's
 *  previous selection, never merges into it, matching updateWeeklyOffDays'
 *  own contract. */
export function WeeklyOffDayForm({ value, lang }: { value: readonly number[]; lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <form
      // Remounts whenever the server's value changes (e.g. router.refresh()
      // after a concurrent save elsewhere) so the uncontrolled checkboxes'
      // defaultChecked — only applied on mount — never goes stale.
      key={value.toSorted((a, b) => a - b).join(',')}
      className="flex flex-wrap items-center gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          setSaved(false)
          const result = await updateWeeklyOffDays(data)
          if (result.error) setError(result.error)
          else {
            setSaved(true)
            router.refresh()
          }
        })
      }}
    >
      <div className="flex flex-wrap gap-3">
        {WEEKDAY_KEYS.map((key, weekday) => (
          <label key={weekday} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="weekday" value={weekday} defaultChecked={value.includes(weekday)} />
            {t(key, lang)}
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-9 cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('attendance.weeklyOffDaySave', lang)}
      </button>
      {saved && !error && <span className="text-sm text-mint-deep">{t('attendance.weeklyOffDaySaved', lang)}</span>}
      {error && <span className="text-sm text-alert-deep">{error}</span>}
      <p className="w-full text-xs text-muted">{t('attendance.weeklyOffDayHint', lang)}</p>
    </form>
  )
}

export function AddOffDayForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addOffDay(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="day">
          {t('attendance.offDayDate', lang)}
        </label>
        <input id="day" name="day" type="date" required className={dateInputClass({ size: 'md', fullWidth: true })} />
      </div>
      <div>
        <label className={labelClass} htmlFor="label">
          {t('attendance.offDayLabelField', lang)}
        </label>
        <input id="label" name="label" className={inputClass} />
      </div>
      <label className="flex h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="is_significant" />
        {t('attendance.offDaySignificant', lang)}
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-10 cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('common.add', lang)}
      </button>
      {error && <p className="w-full text-sm text-alert-deep">{error}</p>}
    </form>
  )
}

// Import the super-admin central holiday template into this school's off-days
// (issue #166). Shows how many were newly added, or that there were none.
export function ImportCentralButton({ lang }: { lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            setNote(null)
            const result = await importCentralOffDays()
            if (result.error) setError(result.error)
            else {
              setNote(
                result.imported
                  ? `${t('attendance.importCentralDone', lang)} (${result.imported})`
                  : t('attendance.importCentralNone', lang),
              )
              router.refresh()
            }
          })
        }
        className="h-10 cursor-pointer rounded-full border border-line-strong px-5 text-sm font-semibold hover:bg-paper-muted disabled:opacity-50"
      >
        {t('attendance.importCentral', lang)}
      </button>
      {note && <span className="text-sm text-mint-deep">{note}</span>}
      {error && <span className="text-sm text-alert-deep">{error}</span>}
    </div>
  )
}

export function DeleteOffDayButton({ day, lang }: { day: string; lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteOffDay(day)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }
        className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        {t('common.delete', lang)}
      </button>
    </span>
  )
}
