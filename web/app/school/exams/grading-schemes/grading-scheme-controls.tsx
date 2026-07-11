'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import type { SchemeType, PassRuleStrategy } from '@/lib/grading'
import {
  addGradingScheme,
  removeGradingScheme,
  addGradeBand,
  removeGradeBand,
} from './actions'

function useSubmit(action: (data: FormData) => Promise<{ error?: string }>) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      setError(null)
      const result = await action(data)
      if (result.error) setError(result.error)
      else form.reset()
    })
  }
  return { error, pending, onSubmit }
}

export function AddGradingSchemeForm({ lang }: { lang: Lang }) {
  const { error, pending, onSubmit } = useSubmit(addGradingScheme)
  return (
    <form className="grid gap-3 sm:grid-cols-4" onSubmit={onSubmit}>
      <div>
        <label className={labelClass} htmlFor="scheme_name">{t('grading.name', lang)}</label>
        <input id="scheme_name" name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="scheme_type">{t('grading.schemeType', lang)}</label>
        <select id="scheme_type" name="scheme_type" required defaultValue="grade_point" className={inputClass}>
          <option value="grade_point">{t('grading.typeGradePoint', lang)}</option>
          <option value="letter">{t('grading.typeLetter', lang)}</option>
          <option value="numeric">{t('grading.typeNumeric', lang)}</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="pass_mark_percent">{t('grading.passMark', lang)}</label>
        <input
          id="pass_mark_percent"
          name="pass_mark_percent"
          type="number"
          min={0}
          max={100}
          step="0.01"
          defaultValue={33}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="pass_rule_strategy">{t('grading.passRule', lang)}</label>
        <select
          id="pass_rule_strategy"
          name="pass_rule_strategy"
          required
          defaultValue="individual"
          className={inputClass}
        >
          <option value="individual">{t('grading.ruleIndividual', lang)}</option>
          <option value="combined_average">{t('grading.ruleCombinedAverage', lang)}</option>
          <option value="optional_conditional">{t('grading.ruleOptionalConditional', lang)}</option>
        </select>
      </div>
      <div className="flex items-center gap-2 sm:col-span-4">
        <input id="combine_subject_groups" name="combine_subject_groups" type="checkbox" className="size-4" />
        <label className="text-sm" htmlFor="combine_subject_groups">
          {t('grading.combineGroups', lang)}
        </label>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-4`}>
        {t('grading.addScheme', lang)}
      </button>
    </form>
  )
}

const SCHEME_TYPE_LABEL_KEY: Record<SchemeType, MessageKey> = {
  grade_point: 'grading.typeGradePoint',
  letter: 'grading.typeLetter',
  numeric: 'grading.typeNumeric',
}

const PASS_RULE_LABEL_KEY: Record<PassRuleStrategy, MessageKey> = {
  individual: 'grading.ruleIndividual',
  combined_average: 'grading.ruleCombinedAverage',
  optional_conditional: 'grading.ruleOptionalConditional',
}

export interface GradingSchemeRow {
  id: string
  name: string
  scheme_type: SchemeType
  pass_mark_percent: number
  pass_rule_strategy: PassRuleStrategy
  combine_subject_groups: boolean
}

export interface GradeBandRow {
  id: string
  grading_scheme_id: string
  label: string
  min_percent: number
  max_percent: number
  grade_point: number | null
  sort_order: number
}

export function GradingSchemeCard({
  scheme,
  bands,
  lang,
}: {
  scheme: GradingSchemeRow
  bands: GradeBandRow[]
  lang: Lang
}) {
  const [showBands, setShowBands] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const showGradePoint = scheme.scheme_type === 'grade_point'

  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{scheme.name}</span>{' '}
          <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
            {t(SCHEME_TYPE_LABEL_KEY[scheme.scheme_type], lang)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>
            {t('grading.passMark', lang)}: {scheme.pass_mark_percent}%
          </span>
          <span>·</span>
          <span>{t(PASS_RULE_LABEL_KEY[scheme.pass_rule_strategy], lang)}</span>
          <span>·</span>
          <span>
            {t('grading.combineGroups', lang)}: {scheme.combine_subject_groups ? t('common.yes', lang) : t('common.no', lang)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowBands((v) => !v)}
          className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {showBands ? t('grading.hideBands', lang) : t('grading.manageBands', lang)}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t('grading.deleteSchemeConfirm', lang))) return
            startTransition(async () => {
              setDeleteError(null)
              const result = await removeGradingScheme(scheme.id)
              if (result.error) setDeleteError(result.error)
            })
          }}
          className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft"
        >
          {t('common.delete', lang)}
        </button>
        {deleteError && <span className="text-xs text-alert-deep">{deleteError}</span>}
      </div>

      {showBands && (
        <div className="mt-4 border-t border-line pt-4">
          <GradeBandTable bands={bands} showGradePoint={showGradePoint} lang={lang} />
          <AddGradeBandForm schemeId={scheme.id} showGradePoint={showGradePoint} lang={lang} />
        </div>
      )}
    </div>
  )
}

function GradeBandTable({
  bands,
  showGradePoint,
  lang,
}: {
  bands: GradeBandRow[]
  showGradePoint: boolean
  lang: Lang
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!bands.length) return <p className="mb-3 text-sm text-muted">{t('grading.noBands', lang)}</p>

  return (
    <table className="mb-3 w-full text-left text-sm">
      <thead>
        <tr className="border-b border-line-strong text-xs uppercase tracking-wide text-muted">
          <th className="py-1 pr-2 font-semibold">{t('grading.label', lang)}</th>
          <th className="py-1 pr-2 font-semibold">{t('grading.minPercent', lang)}</th>
          <th className="py-1 pr-2 font-semibold">{t('grading.maxPercent', lang)}</th>
          {showGradePoint && <th className="py-1 pr-2 font-semibold">{t('grading.gradePoint', lang)}</th>}
          <th className="py-1"></th>
        </tr>
      </thead>
      <tbody>
        {bands.map((b) => (
          <tr key={b.id} className="border-b border-line">
            <td className="py-1 pr-2">{b.label}</td>
            <td className="py-1 pr-2">{b.min_percent}</td>
            <td className="py-1 pr-2">{b.max_percent}</td>
            {showGradePoint && <td className="py-1 pr-2">{b.grade_point ?? '—'}</td>}
            <td className="py-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    setError(null)
                    const result = await removeGradeBand(b.id)
                    if (result.error) setError(result.error)
                  })
                }}
                className="cursor-pointer text-xs text-alert-deep hover:underline"
              >
                {t('common.delete', lang)}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
      {error && (
        <tfoot>
          <tr>
            <td colSpan={showGradePoint ? 5 : 4} className="pt-1 text-xs text-alert-deep">
              {error}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}

function AddGradeBandForm({
  schemeId,
  showGradePoint,
  lang,
}: {
  schemeId: string
  showGradePoint: boolean
  lang: Lang
}) {
  const { error, pending, onSubmit } = useSubmit(addGradeBand)
  return (
    <form className="grid gap-2 sm:grid-cols-5" onSubmit={onSubmit}>
      <input type="hidden" name="grading_scheme_id" value={schemeId} />
      <div>
        <label className={labelClass} htmlFor={`band_label_${schemeId}`}>{t('grading.label', lang)}</label>
        <input id={`band_label_${schemeId}`} name="label" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor={`band_min_${schemeId}`}>{t('grading.minPercent', lang)}</label>
        <input id={`band_min_${schemeId}`} name="min_percent" type="number" min={0} max={100} step="0.01" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor={`band_max_${schemeId}`}>{t('grading.maxPercent', lang)}</label>
        <input id={`band_max_${schemeId}`} name="max_percent" type="number" min={0} max={100} step="0.01" required className={inputClass} />
      </div>
      {showGradePoint && (
        <div>
          <label className={labelClass} htmlFor={`band_gpa_${schemeId}`}>{t('grading.gradePoint', lang)}</label>
          <input id={`band_gpa_${schemeId}`} name="grade_point" type="number" min={0} step="0.01" className={inputClass} />
        </div>
      )}
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="h-10 w-full cursor-pointer rounded-full bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t('grading.addBand', lang)}
        </button>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-5">{error}</p>}
    </form>
  )
}
