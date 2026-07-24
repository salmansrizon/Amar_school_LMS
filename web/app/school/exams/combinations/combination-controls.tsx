'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { addCombination, addCombinationMember, removeCombination, removeCombinationMember } from './actions'
import { selectClass } from '@/components/ui/field'

export interface ClassOption {
  id: string
  name: string
  section: string | null
}

export interface SchemeOption {
  id: string
  name: string
}

export interface ExamOption {
  id: string
  name: string
  exam_year: number
}

export interface MemberRow {
  id: string
  combination_id: string
  exam_id: string
  weight_percent: number | null
}

export interface CombinationRow {
  id: string
  name: string
  class_id: string | null
  strategy: string
  grading_scheme_id: string | null
}

export function AddCombinationForm({
  classes,
  schemes,
  lang,
}: {
  classes: ClassOption[]
  schemes: SchemeOption[]
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addCombination(data)
          if (result.error) setError(result.error)
          else {
            form.reset()
            router.refresh()
          }
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="combination_name">
          {t('combinations.name', lang)}
        </label>
        <input id="combination_name" name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="combination_class">
          {t('combinations.class', lang)}
        </label>
        <select id="combination_class" name="class_id" defaultValue="" className={selectClass({ size: 'md', fullWidth: true })}>
          <option value="">{t('combinations.anyClass', lang)}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.section ? ` - ${c.section}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="combination_strategy">
          {t('combinations.strategy', lang)}
        </label>
        <select id="combination_strategy" name="strategy" defaultValue="sum" className={selectClass({ size: 'md', fullWidth: true })}>
          <option value="sum">{t('combinations.strategySum', lang)}</option>
          <option value="weighted_percentage">{t('combinations.strategyWeighted', lang)}</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="combination_scheme">
          {t('combinations.gradingScheme', lang)}
        </label>
        <select id="combination_scheme" name="grading_scheme_id" defaultValue="" className={selectClass({ size: 'md', fullWidth: true })}>
          <option value="">{t('examSetup.noScheme', lang)}</option>
          {schemes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-2`}>
        {t('combinations.add', lang)}
      </button>
    </form>
  )
}

export function CombinationCard({
  combination,
  classLabel,
  schemeName,
  members,
  exams,
  lang,
}: {
  combination: CombinationRow
  classLabel: string | null
  schemeName: string | null
  members: MemberRow[]
  exams: ExamOption[]
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const examById = new Map(exams.map((e) => [e.id, e]))

  return (
    <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold">{combination.name}</h3>
          <p className="text-xs text-muted">
            {combination.strategy === 'sum' ? t('combinations.strategySum', lang) : t('combinations.strategyWeighted', lang)}
            {classLabel ? ` · ${classLabel}` : ''}
            {schemeName ? ` · ${schemeName}` : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              setError(null)
              const result = await removeCombination(combination.id)
              if (result.error) setError(result.error)
              else router.refresh()
            })
          }}
          className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('combinations.delete', lang)}
        </button>
      </div>

      {error && <p className="mb-2 text-xs text-alert-deep">{error}</p>}

      <h4 className="mb-2 text-sm font-semibold">{t('combinations.members', lang)}</h4>
      {members.length > 0 && (
        <ul className="mb-3 divide-y divide-line text-sm">
          {members.map((m) => (
            <MemberRowView key={m.id} member={m} examLabel={examLabel(examById.get(m.exam_id))} lang={lang} />
          ))}
        </ul>
      )}
      <AddMemberForm combinationId={combination.id} exams={exams} lang={lang} />
      {combination.strategy === 'weighted_percentage' && (
        <p className="mt-2 text-xs text-muted">{t('combinations.weightHint', lang)}</p>
      )}
    </div>
  )
}

function examLabel(exam: ExamOption | undefined): string {
  if (!exam) return '—'
  return `${exam.name} (${exam.exam_year})`
}

function MemberRowView({ member, examLabel, lang }: { member: MemberRow; examLabel: string; lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <li className="flex items-center justify-between py-2">
      <span>{examLabel}</span>
      <span className="flex items-center gap-2">
        <span className="text-muted">
          {member.weight_percent === null ? '—' : `${member.weight_percent}%`}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await removeCombinationMember(member.id)
              router.refresh()
            })
          }}
          className="cursor-pointer rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('combinations.deleteMember', lang)}
        </button>
      </span>
    </li>
  )
}

function AddMemberForm({ combinationId, exams, lang }: { combinationId: string; exams: ExamOption[]; lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        data.set('combination_id', combinationId)
        startTransition(async () => {
          setError(null)
          const result = await addCombinationMember(data)
          if (result.error) setError(result.error)
          else {
            form.reset()
            router.refresh()
          }
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor={`member_exam_${combinationId}`}>
          {t('combinations.exam', lang)}
        </label>
        <select id={`member_exam_${combinationId}`} name="exam_id" required defaultValue="" className={selectClass({ size: 'xs', fullWidth: true })}>
          <option value="" disabled>
            {t('combinations.exam', lang)}
          </option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.exam_year})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`member_weight_${combinationId}`}>
          {t('combinations.weight', lang)}
        </label>
        <input
          id={`member_weight_${combinationId}`}
          name="weight_percent"
          type="number"
          min={0}
          max={100}
          className={`${inputClass} h-8 w-24`}
        />
      </div>
      <button type="submit" disabled={pending} className="cursor-pointer rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        {t('combinations.addMember', lang)}
      </button>
      {error && <p className="w-full text-xs text-alert-deep">{error}</p>}
    </form>
  )
}
