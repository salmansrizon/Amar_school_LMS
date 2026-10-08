'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { Modal } from '@/components/modal'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { t, type Lang } from '@/lib/i18n'
import { EMPLOYEE_CATEGORIES, EMPLOYEE_CATEGORY_LABEL_KEY } from '@/lib/employees'
import { ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'
import { GRACE_DETAILS, GRACE_DETAIL_LABEL_KEY } from '@/lib/grace'
import { dateInputClass } from '@/components/ui/field'
import {
  previewStandingGraceRule,
  saveStandingGraceRule,
  deleteStandingGraceRule,
  addAdHocGraceExemption,
  deleteAdHocGraceExemption,
  type StandingRuleConflict,
} from './actions'
import { DateField } from '@/components/ui/date-field'

// Grace Time controls (issue #673): the Add Grace Rule modal mirrors Office
// Hour's Add panel (single Shift radio, Categories with Select All,
// preview-then-confirm overwrite); the Ad-Hoc form gains the same Shift and
// Select All controls. Shift is display-only (ADR 0032).

function toggleSet<T>(prev: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(prev)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function ShiftRadios({
  name,
  shiftOptions,
  shift,
  onChange,
  lang,
}: {
  name: string
  shiftOptions: readonly AcademicShift[]
  shift: string | null
  onChange: (shift: string) => void
  lang: Lang
}) {
  if (!shiftOptions.length) return null
  return (
    <div>
      <p className={labelClass}>{t('officeHour.shift', lang)}</p>
      <div className="flex flex-wrap gap-3">
        {shiftOptions.map((s) => (
          <label key={s} className="flex items-center gap-1.5 text-sm">
            <input type="radio" name={name} checked={shift === s} onChange={() => onChange(s)} />
            {t(ACADEMIC_SHIFT_LABEL_KEY[s], lang)}
          </label>
        ))}
      </div>
    </div>
  )
}

function CategoryChecklist({
  categories,
  onChange,
  lang,
}: {
  categories: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
  lang: Lang
}) {
  const allSelected = EMPLOYEE_CATEGORIES.every((c) => categories.has(c))
  return (
    <div>
      <p className={labelClass}>{t('graceTime.exemptionCategories', lang)}</p>
      <label className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => onChange(allSelected ? new Set() : new Set(EMPLOYEE_CATEGORIES))}
        />
        {t('classes.selectAll', lang)}
      </label>
      <div className="grid max-h-40 gap-1 overflow-y-auto border-t border-line pt-2 sm:grid-cols-2">
        {EMPLOYEE_CATEGORIES.map((c) => (
          <label key={c} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={categories.has(c)} onChange={() => onChange(toggleSet(categories, c))} />
            {t(EMPLOYEE_CATEGORY_LABEL_KEY[c], lang)}
          </label>
        ))}
      </div>
    </div>
  )
}

/** Keeps a form's Shift in step with the page's active Shift tab across soft
 *  navigations (same render-time adjustment OfficeHourForm uses). */
function useActiveShift(activeShift: string | null) {
  const [shift, setShift] = useState<string | null>(activeShift)
  const [prevActiveShift, setPrevActiveShift] = useState(activeShift)
  if (activeShift !== prevActiveShift) {
    setPrevActiveShift(activeShift)
    setShift(activeShift)
  }
  return [shift, setShift] as const
}

export function AddStandingRuleForm({
  lang,
  shiftOptions,
  activeShift,
}: {
  lang: Lang
  shiftOptions: readonly AcademicShift[]
  activeShift: string | null
}) {
  const router = useRouter()
  const [shift, setShift] = useActiveShift(activeShift)
  const [detail, setDetail] = useState('')
  const [categories, setCategories] = useState<ReadonlySet<string>>(new Set())
  const [minutes, setMinutes] = useState('')
  const [conflict, setConflict] = useState<StandingRuleConflict | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const buildFormData = () => {
    const fd = new FormData()
    if (shift) fd.set('shift', shift)
    fd.set('grace_detail', detail)
    for (const c of categories) fd.append('category', c)
    fd.set('grace_minutes', minutes)
    return fd
  }

  const reset = () => {
    setDetail('')
    setCategories(new Set())
    setMinutes('')
    setConflict(null)
    setError(null)
    setShift(activeShift)
  }

  const runSave = (close: () => void) => {
    const fd = buildFormData()
    startTransition(async () => {
      const res = await saveStandingGraceRule(fd)
      if (res.error) {
        setError(res.error)
        return
      }
      close()
      router.refresh()
    })
  }

  const handlePreview = (close: () => void) => {
    setError(null)
    const fd = buildFormData()
    startTransition(async () => {
      const res = await previewStandingGraceRule(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      if (res.conflict) setConflict(res.conflict)
      else runSave(close)
    })
  }

  return (
    <Modal
      lang={lang}
      triggerLabel={t('graceTime.addRule', lang)}
      triggerClassName="inline-flex min-h-9 cursor-pointer items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600"
      title={t('graceTime.addRule', lang)}
      onOpenChange={(open) => {
        if (!open) reset()
      }}
    >
      {(close) =>
        conflict ? (
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-alert-deep">{t('graceTime.conflictTitle', lang)}</p>
            <p className="text-sm text-muted">{t('graceTime.conflictIntro', lang)}</p>
            <ul className="grid gap-1 rounded-md border border-line bg-paper-muted p-3 text-sm">
              <li>
                {conflict.categories.join(', ')} · {conflict.grace_minutes} {t('attendance.graceMinutesSuffix', lang)}
              </li>
              <li>
                → {[...categories].join(', ')} · {minutes} {t('attendance.graceMinutesSuffix', lang)}
              </li>
            </ul>
            {error && <p className="text-sm text-alert-deep">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => runSave(close)} className={`${primaryBtnClass} flex-1`}>
                {t('graceTime.conflictConfirm', lang)}
              </button>
              <button
                type="button"
                onClick={() => setConflict(null)}
                className="cursor-pointer rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-paper-muted"
              >
                {t('graceTime.conflictCancel', lang)}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div>
              <label className={labelClass} htmlFor="grace-detail">
                {t('graceTime.graceDetail', lang)}
              </label>
              <select
                id="grace-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  {t('graceTime.graceDetail', lang)}
                </option>
                {GRACE_DETAILS.map((d) => (
                  <option key={d} value={d}>
                    {t(GRACE_DETAIL_LABEL_KEY[d], lang)}
                  </option>
                ))}
              </select>
            </div>

            <CategoryChecklist categories={categories} onChange={setCategories} lang={lang} />

            <ShiftRadios name="grace-rule-shift" shiftOptions={shiftOptions} shift={shift} onChange={setShift} lang={lang} />

            <div>
              <label className={labelClass} htmlFor="grace-minutes">
                {t('graceTime.minutesLabel', lang)}
              </label>
              <input
                id="grace-minutes"
                type="number"
                min={0}
                required
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className={`${inputClass} w-32`}
              />
            </div>

            {error && <p className="text-sm text-alert-deep">{error}</p>}

            <button type="button" disabled={pending} onClick={() => handlePreview(close)} className={primaryBtnClass}>
              {t('graceTime.save', lang)}
            </button>
          </div>
        )
      }
    </Modal>
  )
}

export function AddAdHocExemptionForm({
  lang,
  shiftOptions,
  activeShift,
}: {
  lang: Lang
  shiftOptions: readonly AcademicShift[]
  activeShift: string | null
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [shift, setShift] = useActiveShift(activeShift)
  const [categories, setCategories] = useState<ReadonlySet<string>>(new Set())

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        if (shift) data.set('shift', shift)
        for (const c of categories) data.append('category', c)
        startTransition(async () => {
          setError(null)
          const result = await addAdHocGraceExemption(data)
          if (result.error) setError(result.error)
          else {
            form.reset()
            setCategories(new Set())
            router.refresh()
          }
        })
      }}
    >
      <div className="flex flex-wrap gap-3">
        <div>
          <label className={labelClass} htmlFor="exemption_date">{t('graceTime.exemptionDate', lang)}</label>
          <DateField lang={lang} id="exemption_date" name="exemption_date" required className={dateInputClass({ size: 'md' })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="duration_minutes">{t('graceTime.exemptionDuration', lang)}</label>
          <input id="duration_minutes" name="duration_minutes" type="number" min={0} required className={`${inputClass} w-32`} />
        </div>
        <div className="min-w-64 flex-1">
          <label className={labelClass} htmlFor="details">{t('graceTime.exemptionDetails', lang)}</label>
          <input id="details" name="details" className={inputClass} />
        </div>
      </div>
      <ShiftRadios name="ad-hoc-shift" shiftOptions={shiftOptions} shift={shift} onChange={setShift} lang={lang} />
      <CategoryChecklist categories={categories} onChange={setCategories} lang={lang} />
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-fit cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('common.add', lang)}
      </button>
      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </form>
  )
}

const deleteTrigger =
  'cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft'

export function DeleteGraceEntryButton({
  id,
  kind,
  lang,
}: {
  id: string
  kind: 'standing' | 'adHoc'
  lang: Lang
}) {
  const router = useRouter()
  return (
    <ConfirmDialog
      triggerLabel={t('common.delete', lang)}
      triggerClassName={deleteTrigger}
      title={t('graceTime.confirmDelete', lang)}
      confirmLabel={t('common.delete', lang)}
      cancelLabel={t('graceTime.cancel', lang)}
      onConfirm={async () => {
        const res = kind === 'standing' ? await deleteStandingGraceRule(id) : await deleteAdHocGraceExemption(id)
        if (!res.error) router.refresh()
        return res
      }}
    />
  )
}
