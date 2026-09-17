'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { classCatalogueLabel, classCatalogueOptions, type ClassCatalogueRow } from '@/lib/class-catalogue'
import { firstRelation } from '@/lib/supabase/relation'
import { selectClass } from '@/components/ui/field'
import { primaryBtnClass } from '@/components/auth-card'
import { Modal } from '@/components/modal'
import { copySubjectsToClass } from './actions'
import { DeleteButton } from './class-controls'

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export interface SubjectListRow {
  id: string
  name: string
  code: string | null
  theory_marks: number
  mcq_marks: number
  practical_marks: number
  paper_count: number
  class_id: string | null
  // Supabase types a to-one embed as an array (see lib/supabase/relation.ts);
  // normalized with firstRelation() wherever this is read.
  class_offerings: {
    name: string
    section: string | null
    group_department: string | null
    shift: string | null
    academic_year: number | null
  }[]
}

/** The result of a "Copy to Class" run (issue #642) — same shape
 *  CopyResultPanel (Copy Classes from Year) already shows, reusing its
 *  copied/skipped i18n keys since the wording is generic enough for either
 *  bulk action. */
function CopyResult({ lang, copied, skipped, onDone }: { lang: Lang; copied: number; skipped: number; onDone: () => void }) {
  return (
    <div role="status" className="rounded-md border border-line bg-paper-muted p-3 text-sm">
      <p>{t('classes.copyCopied', lang).replace('{n}', String(copied))}</p>
      <p>{t('classes.copySkipped', lang).replace('{n}', String(skipped))}</p>
      <button
        type="button"
        onClick={onDone}
        className="mt-2 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
      >
        {t('classes.copyDismiss', lang)}
      </button>
    </div>
  )
}

/** "Copy to Class" bulk action (issue #642): the trigger button + Modal
 *  live together so the trigger's own label can carry the live selection
 *  count. Mounted only while selectedIds is non-empty (see SubjectListTable
 *  below), so it always opens fresh/closed. */
function CopySubjectsAction({
  lang,
  selectedIds,
  targetOptions,
  onCopied,
}: {
  lang: Lang
  selectedIds: string[]
  targetOptions: { value: string; label: string }[]
  onCopied: () => void
}) {
  const [targetClassId, setTargetClassId] = useState('')
  const [result, setResult] = useState<{ copied: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Modal
      lang={lang}
      triggerLabel={`${t('classes.copySubjectsToClass', lang)} (${selectedIds.length})`}
      triggerClassName="inline-flex min-h-9 cursor-pointer items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600"
      title={t('classes.copySubjectsTitle', lang)}
    >
      {(close) =>
        result ? (
          <CopyResult
            lang={lang}
            copied={result.copied}
            skipped={result.skipped}
            onDone={() => {
              close()
              onCopied()
            }}
          />
        ) : (
          <div className="grid gap-3">
            <select
              value={targetClassId}
              onChange={(e) => setTargetClassId(e.target.value)}
              className={selectClass({ size: 'md', fullWidth: true })}
            >
              <option value="">{t('institute.selectOne', lang)}</option>
              {targetOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {error && <p className="text-sm text-alert-deep">{error}</p>}
            <button
              type="button"
              disabled={pending || !targetClassId}
              onClick={() =>
                startTransition(async () => {
                  setError(null)
                  const res = await copySubjectsToClass(selectedIds, targetClassId)
                  if ('error' in res) setError(res.error)
                  else setResult(res)
                })
              }
              className={`${primaryBtnClass} disabled:opacity-50`}
            >
              {t('classes.copyConfirm', lang)}
            </button>
          </div>
        )
      }
    </Modal>
  )
}

/** Subject List's table (issue #642) — a client component so a shared
 *  checkbox-selection Set can live above every row and the bulk "Copy to
 *  Class" action that reads it. `subjects` is whatever the page's own
 *  Global Selection + Class filter (issue #641) already narrowed it to;
 *  selection is derived by intersecting with the live `subjects` prop on
 *  every read (never trusted as-is) so a stale id surviving a filter change
 *  underneath this same component instance can never leak into a copy. */
export function SubjectListTable({
  lang,
  subjects,
  showYear,
  allClasses,
  noSubjectsMessage,
}: {
  lang: Lang
  subjects: SubjectListRow[]
  showYear: boolean
  allClasses: ClassCatalogueRow[]
  noSubjectsMessage: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const selectedSubjects = subjects.filter((s) => selected.has(s.id))
  const selectedIds = selectedSubjects.map((s) => s.id)
  const allSelected = subjects.length > 0 && subjects.every((s) => selected.has(s.id))
  const sourceClassIds = new Set(selectedSubjects.map((s) => s.class_id).filter((id): id is string => id != null))
  const targetOptions = classCatalogueOptions(allClasses, showYear).filter((o) => !sourceClassIds.has(o.value))

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(subjects.map((s) => s.id)))
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (!subjects.length) return <p className="text-sm text-muted">{noSubjectsMessage}</p>

  return (
    <div className="grid gap-3">
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2">
          <CopySubjectsAction
            lang={lang}
            selectedIds={selectedIds}
            targetOptions={targetOptions}
            onCopied={() => {
              setSelected(new Set())
              router.refresh()
            }}
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line-strong">
              <th className={thClass}>
                <input
                  type="checkbox"
                  aria-label={t('classes.selectAll', lang)}
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th className={thClass}>{t('classes.subject', lang)}</th>
              <th className={thClass}>{t('classes.class', lang)}</th>
              <th className={thClass}>{t('classes.theory', lang)}</th>
              <th className={thClass}>{t('classes.mcq', lang)}</th>
              <th className={thClass}>{t('classes.practical', lang)}</th>
              <th className={thClass}>{t('classes.multiPaper', lang)}</th>
              <th className={thClass}>{t('classes.actions', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => {
              const cls = firstRelation(s.class_offerings)
              return (
                <tr key={s.id} className="border-b border-line">
                  <td className={tdClass}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} />
                  </td>
                  <td className={`${tdClass} font-medium`}>
                    {s.name}
                    {s.code ? <span className="text-muted"> ({s.code})</span> : null}
                  </td>
                  <td className={tdClass}>
                    {cls ? classCatalogueLabel(cls, showYear) : <span className="text-muted">—</span>}
                  </td>
                  <td className={tdClass}>{s.theory_marks > 0 ? s.theory_marks : <span className="text-muted">—</span>}</td>
                  <td className={tdClass}>{s.mcq_marks > 0 ? s.mcq_marks : <span className="text-muted">—</span>}</td>
                  <td className={tdClass}>{s.practical_marks > 0 ? s.practical_marks : <span className="text-muted">—</span>}</td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        s.paper_count > 1 ? 'bg-sky-soft text-sky-deep' : 'bg-paper-muted text-muted'
                      }`}
                    >
                      {s.paper_count > 1 ? `${s.paper_count} ${t('classes.papersWord', lang)}` : t('classes.singlePaper', lang)}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <DeleteButton entity="subjects" id={s.id} lang={lang} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
