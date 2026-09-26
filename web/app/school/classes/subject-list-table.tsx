'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { classCatalogueOptions, type ClassCatalogueRow } from '@/lib/class-catalogue'
import { selectClass } from '@/components/ui/field'
import { primaryBtnClass } from '@/components/auth-card'
import { Modal } from '@/components/modal'
import { copySubjectsToClass } from './actions'

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

/** The staged "Copy to Class" run (issue #642, map 013 A1): the DataTable
 *  bulk bar picked the Subjects (`?copy=`), this bar opens the target-class
 *  Modal. `selectedIds` is already intersected with the visible Subjects by
 *  the page, so a stale id in the URL never reaches the copy. */
export function CopySubjectsBar({
  lang,
  selectedIds,
  sourceClassIds,
  allClasses,
  showYear,
  cancelHref,
}: {
  lang: Lang
  selectedIds: string[]
  sourceClassIds: string[]
  allClasses: ClassCatalogueRow[]
  showYear: boolean
  cancelHref: string
}) {
  const router = useRouter()
  const sources = new Set(sourceClassIds)
  const targetOptions = classCatalogueOptions(allClasses, showYear).filter((o) => !sources.has(o.value))
  return (
    <div
      role="status"
      className="mb-grid flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-card py-2"
    >
      <span className="text-sm font-semibold">
        {selectedIds.length} {t('table.selected', lang)}
      </span>
      <CopySubjectsAction
        lang={lang}
        selectedIds={selectedIds}
        targetOptions={targetOptions}
        onCopied={() => router.replace(cancelHref, { scroll: false })}
      />
      <Link href={cancelHref} scroll={false} className="ml-auto text-xs font-semibold text-muted hover:text-ink">
        {t('table.clearSelection', lang)}
      </Link>
    </div>
  )
}
