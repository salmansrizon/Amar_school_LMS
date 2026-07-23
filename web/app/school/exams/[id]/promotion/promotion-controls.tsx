'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { makeOldStudents, promoteStudents, setClassFinal } from './actions'
import { selectClass } from '@/components/ui/field'

export interface ClassOption {
  id: string
  name: string
  section: string | null
}

export interface CombinationOption {
  id: string
  name: string
}

/** Result source + rank-basis toolbar. Both are server-computed (each option
 * re-runs the combine/rank math for a different data set), so switching
 * either navigates via query params rather than recomputing client-side. */
export function ResultControlsBar({
  combinations,
  source,
  basis,
  lang,
}: {
  combinations: CombinationOption[]
  source: string
  basis: 'grade' | 'mark'
  lang: Lang
}) {
  const router = useRouter()
  const pathname = usePathname()

  function navigate(nextSource: string, nextBasis: string) {
    router.push(`${pathname}?source=${nextSource}&basis=${nextBasis}`)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('promotion.resultSource', lang)}</label>
        <select value={source} onChange={(e) => navigate(e.target.value, basis)} className={`${selectClass({ size: 'md', fullWidth: true })} min-w-56`}>
          <option value="exam">{t('promotion.thisExamOnly', lang)}</option>
          {combinations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('promotion.rankBasis', lang)}</label>
        <select value={basis} onChange={(e) => navigate(source, e.target.value)} className={`${selectClass({ size: 'md', fullWidth: true })} min-w-40`}>
          <option value="grade">{t('promotion.rankByGrade', lang)}</option>
          <option value="mark">{t('promotion.rankByMark', lang)}</option>
        </select>
      </div>
    </div>
  )
}

export interface PromotionStudentRow {
  id: string
  roll_number: number | null
  full_name: string
  passed: boolean
  label: string | null
  position: number | null
}

export function PromotionTable({
  examId,
  rows,
  classes,
  currentClassName,
  lang,
}: {
  examId: string
  rows: PromotionStudentRow[]
  classes: ClassOption[]
  currentClassName: string | null
  lang: Lang
}) {
  const router = useRouter()
  const [toClassId, setToClassId] = useState('')
  const [checked, setChecked] = useState<Set<string>>(() => new Set(rows.filter((r) => r.passed).map((r) => r.id)))
  const [newRolls, setNewRolls] = useState<Map<string, string>>(
    () => new Map(rows.map((r) => [r.id, r.roll_number !== null ? String(r.roll_number) : ''])),
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const targetClass = classes.find((c) => c.id === toClassId)

  if (!rows.length) return <p className="text-sm text-muted">{t('promotion.noneToPromote', lang)}</p>

  return (
    <>
      <div className="mb-3 max-w-sm">
        <label className="mb-1 block text-xs font-semibold text-muted">{t('promotion.promoteTo', lang)}</label>
        <select value={toClassId} onChange={(e) => setToClassId(e.target.value)} className={selectClass({ size: 'md', fullWidth: true })}>
          <option value="">—</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.section ? ` - ${c.section}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-160 text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="py-2 pr-2" />
              <th className="py-2 pr-2">{t('promotion.currentRoll', lang)}</th>
              <th className="py-2 pr-2">{t('students.name', lang)}</th>
              <th className="py-2 pr-2">{t('promotion.result', lang)}</th>
              <th className="py-2 pr-2 text-right">{t('promotion.position', lang)}</th>
              <th className="py-2 pr-2">{t('promotion.newClass', lang)}</th>
              <th className="py-2">{t('promotion.newRoll', lang)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const isChecked = checked.has(row.id) && row.passed
              return (
                <tr key={row.id}>
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      disabled={!row.passed}
                      checked={isChecked}
                      onChange={(e) => {
                        setChecked((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(row.id)
                          else next.delete(row.id)
                          return next
                        })
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">{row.roll_number ?? '—'}</td>
                  <td className="py-2 pr-2 font-medium">{row.full_name}</td>
                  <td className="py-2 pr-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        row.passed ? 'bg-mint-soft text-mint-deep' : 'bg-alert-soft text-alert-deep'
                      }`}
                    >
                      {row.passed ? t('promotion.pass', lang) : t('promotion.fail', lang)}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right">{row.position ?? '—'}</td>
                  <td className="py-2 pr-2">
                    {row.passed ? (
                      targetClass ? (
                        `${targetClass.name}${targetClass.section ? ` - ${targetClass.section}` : ''}`
                      ) : (
                        <span className="text-muted">—</span>
                      )
                    ) : (
                      `${currentClassName ?? ''} ${t('promotion.repeat', lang)}`
                    )}
                  </td>
                  <td className="py-2">
                    {row.passed ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newRolls.get(row.id) ?? ''}
                        onChange={(e) =>
                          setNewRolls((prev) => {
                            const next = new Map(prev)
                            next.set(row.id, e.target.value)
                            return next
                          })
                        }
                        className="h-7 w-16 rounded-md border border-line-strong bg-paper px-2 text-center text-sm"
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={pending || !toClassId}
          onClick={() => {
            const items = rows
              .filter((r) => r.passed && checked.has(r.id))
              .map((r) => {
                const raw = newRolls.get(r.id)
                const n = raw ? Number(raw) : NaN
                return { studentId: r.id, newRoll: Number.isFinite(n) && n > 0 ? n : null }
              })
            if (!items.length) return
            startTransition(async () => {
              setError(null)
              const result = await promoteStudents(examId, targetClass?.name ?? '', targetClass?.section ?? null, items)
              if (result.error) setError(result.error)
              router.refresh()
            })
          }}
          className="cursor-pointer rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('promotion.promoteSelected', lang)}
        </button>
      </div>
    </>
  )
}

/** Gates the Graduating Batch / "Make Old" section (per Spec review: classes
 * carry no "final/graduating" marker anywhere in the schema, so without this
 * toggle any exam's passed students could be archived, not just a genuine
 * terminal class's). Always visible so the school can flip it on for the
 * class this exam belongs to; GraduatingSection itself only renders once set. */
export function FinalClassToggle({
  examId,
  classId,
  isFinalClass,
  lang,
}: {
  examId: string
  classId: string
  isFinalClass: boolean
  lang: Lang
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <label className="mb-4 flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={isFinalClass}
        disabled={pending}
        onChange={(e) => {
          startTransition(async () => {
            await setClassFinal(examId, classId, e.target.checked)
            router.refresh()
          })
        }}
      />
      <span>{t('promotion.markFinalClass', lang)}</span>
      <span className="text-xs text-muted">— {t('promotion.markFinalClassHint', lang)}</span>
    </label>
  )
}

export function GraduatingSection({
  examId,
  rows,
  lang,
}: {
  examId: string
  rows: PromotionStudentRow[]
  lang: Lang
}) {
  const router = useRouter()
  const passed = rows.filter((r) => r.passed)
  const [checked, setChecked] = useState<Set<string>>(() => new Set(passed.map((r) => r.id)))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!passed.length) return null

  return (
    <section className="mt-6 rounded-lg border border-line bg-paper p-5 shadow-card">
      <h3 className="mb-1 font-bold">{t('promotion.graduatingTitle', lang)}</h3>
      <p className="mb-3 text-xs text-muted">{t('promotion.graduatingHint', lang)}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-120 text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="py-2 pr-2" />
              <th className="py-2 pr-2">{t('students.roll', lang)}</th>
              <th className="py-2 pr-2">{t('students.name', lang)}</th>
              <th className="py-2">{t('promotion.result', lang)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {passed.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={checked.has(row.id)}
                    onChange={(e) => {
                      setChecked((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(row.id)
                        else next.delete(row.id)
                        return next
                      })
                    }}
                  />
                </td>
                <td className="py-2 pr-2">{row.roll_number ?? '—'}</td>
                <td className="py-2 pr-2 font-medium">{row.full_name}</td>
                <td className="py-2">
                  <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
                    {t('promotion.pass', lang)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
      <button
        type="button"
        disabled={pending || !checked.size}
        onClick={() => {
          startTransition(async () => {
            setError(null)
            const result = await makeOldStudents(examId, [...checked])
            if (result.error) setError(result.error)
            router.refresh()
          })
        }}
        className="mt-4 cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted disabled:opacity-50"
      >
        {t('promotion.makeOldSelected', lang)}
      </button>
    </section>
  )
}
