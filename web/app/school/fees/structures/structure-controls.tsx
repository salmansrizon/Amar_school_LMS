'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { saveFeeStructure, copyFeeStructure } from './actions'

export interface ClassOption {
  id: string
  name: string
  section: string | null
}

export interface FeeStructureEditing {
  id: string
  class_id: string
  academic_year: number
  fee_type: 'monthly' | 'one_time_yearly'
  amount: number
  fine_per_absent_day: number
}

function ClassSelect({
  id,
  name,
  classes,
  defaultValue,
  lang,
}: {
  id: string
  name: string
  classes: ClassOption[]
  defaultValue: string
  lang: Lang
}) {
  return (
    <select id={id} name={name} required defaultValue={defaultValue} className={inputClass}>
      <option value="" disabled>
        {t('fees.pickClass', lang)}
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

/** Create or edit a Fee Structure (issue #34): Class/Year + fee type + amount
 *  + absent-fine rate per day. Reused for both the "+ New" form and per-row edit. */
export function FeeStructureForm({
  classes,
  lang,
  editing,
}: {
  classes: ClassOption[]
  lang: Lang
  editing?: FeeStructureEditing
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const now = new Date()

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        if (editing) data.set('edit_id', editing.id)
        startTransition(async () => {
          setError(null)
          const result = await saveFeeStructure(data)
          if (result.error) {
            setError(result.error)
            return
          }
          if (!editing) form.reset()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor={`fs_class_${editing?.id ?? 'new'}`}>
          {t('fees.class', lang)}
        </label>
        <ClassSelect
          id={`fs_class_${editing?.id ?? 'new'}`}
          name="class_id"
          classes={classes}
          defaultValue={editing?.class_id ?? ''}
          lang={lang}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`fs_year_${editing?.id ?? 'new'}`}>
          {t('fees.academicYear', lang)}
        </label>
        <input
          id={`fs_year_${editing?.id ?? 'new'}`}
          name="academic_year"
          type="number"
          min={2000}
          max={2100}
          defaultValue={editing?.academic_year ?? now.getFullYear()}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`fs_type_${editing?.id ?? 'new'}`}>
          {t('fees.feeType', lang)}
        </label>
        <select
          id={`fs_type_${editing?.id ?? 'new'}`}
          name="fee_type"
          defaultValue={editing?.fee_type ?? 'monthly'}
          className={inputClass}
        >
          <option value="monthly">{t('fees.monthly', lang)}</option>
          <option value="one_time_yearly">{t('fees.oneTimeYearly', lang)}</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`fs_amount_${editing?.id ?? 'new'}`}>
          {t('fees.amount', lang)}
        </label>
        <input
          id={`fs_amount_${editing?.id ?? 'new'}`}
          name="amount"
          type="number"
          min={0}
          step="0.01"
          defaultValue={editing?.amount ?? 0}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`fs_fine_${editing?.id ?? 'new'}`}>
          {t('fees.finePerDay', lang)}
        </label>
        <input
          id={`fs_fine_${editing?.id ?? 'new'}`}
          name="fine_per_absent_day"
          type="number"
          min={0}
          step="0.01"
          defaultValue={editing?.fine_per_absent_day ?? 0}
          className={inputClass}
        />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-3">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-3`}>
        {t('fees.save', lang)}
      </button>
    </form>
  )
}

/** Copy-between-class/year (PRD §5.6): retargets a structure's fee_type/amount/
 *  fine rate onto another Class/Year via the copyFeeStructure upsert action. */
export function CopyFeeStructureForm({
  sourceId,
  classes,
  lang,
}: {
  sourceId: string
  classes: ClassOption[]
  lang: Lang
}) {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  const now = new Date()

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        const targetClassId = String(data.get('target_class_id') ?? '')
        const targetYear = Number(data.get('target_year'))
        startTransition(async () => {
          setError(null)
          setDone(false)
          const result = await copyFeeStructure(sourceId, targetClassId, targetYear)
          if (result.error) {
            setError(result.error)
            return
          }
          setDone(true)
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor={`copy_class_${sourceId}`}>
          {t('fees.targetClass', lang)}
        </label>
        <ClassSelect
          id={`copy_class_${sourceId}`}
          name="target_class_id"
          classes={classes}
          defaultValue=""
          lang={lang}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`copy_year_${sourceId}`}>
          {t('fees.targetYear', lang)}
        </label>
        <input
          id={`copy_year_${sourceId}`}
          name="target_year"
          type="number"
          min={2000}
          max={2100}
          defaultValue={now.getFullYear() + 1}
          required
          className={inputClass}
        />
      </div>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={pending} className={primaryBtnClass}>
          {t('fees.copyStructure', lang)}
        </button>
        {done && !error && <span className="text-sm text-mint-deep">✓</span>}
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-3">{error}</p>}
    </form>
  )
}
