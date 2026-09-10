'use client'

import { useMemo, useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'
import { addClass, addSubject, copyClassesFromYear, removeItem } from './actions'
import { selectClass } from '@/components/ui/field'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { classCatalogueLabel, type ClassCatalogueRow } from '@/lib/class-catalogue'
import {
  copyOutcomeKind,
  defaultCopySourceYear,
  newClassYearHint,
  type CopyResult,
  type CopySourceYear,
} from '@/lib/classes'
import { subjectSuggestionsForClass } from '@/lib/subject-catalogue'
import { Combobox, ComboboxInputGroup, ComboboxInput, ComboboxTrigger, ComboboxPopup, ComboboxItem } from '@/components/ui/combobox'

function useSubmit(action: (data: FormData) => Promise<{ error?: string }>, onSuccess?: () => void) {
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
      else {
        form.reset()
        onSuccess?.()
      }
    })
  }
  return { error, pending, onSubmit }
}

export interface TeacherOption {
  id: string
  full_name: string
}

export function AddClassForm({
  lang,
  teachers,
  shiftChoices = [],
  activeAcademicYear = null,
}: {
  lang: Lang
  teachers: TeacherOption[]
  /** The School's active Academic Year, shown as read-only confirmation only
   *  (map #609, T9/#618). `addClass` stamps it server-side — it is never a
   *  submitted field. Null (pre-backfill School) renders nothing, never a
   *  fabricated year. */
  activeAcademicYear?: number | null
  /** Shift is a class-level dimension (issue #578) — choices are
   *  `configured_shifts ∩ effectiveGlobalShiftSelection` (already
   *  intersected by the caller), never the raw ACADEMIC_SHIFTS vocabulary.
   *  Empty means either a No-Shift School, or every configured Shift is
   *  currently deselected from Global Shift Selection — either way, no
   *  field is rendered, matching #578's "not presented at all" rule. */
  shiftChoices?: readonly AcademicShift[]
}) {
  const { error, pending, onSubmit } = useSubmit(addClass)
  const yearHint = newClassYearHint(activeAcademicYear)
  return (
    <form className="grid gap-3 sm:grid-cols-4" onSubmit={onSubmit}>
      <div>
        <label className={labelClass} htmlFor="class_name">{t('classes.name', lang)}</label>
        <input id="class_name" name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="class_section">{t('classes.section', lang)}</label>
        <input id="class_section" name="section" className={inputClass} />
      </div>
      {yearHint != null && (
        <div className="flex flex-col justify-end">
          {/* Read-only confirmation — no form field. addClass stamps the year
              server-side (map #609, T9/#618); the creation flow cannot place an
              Offering under an older year. */}
          <p className="pb-2 text-sm font-medium text-muted">
            {t('classes.newClassYear', lang).replace('{year}', String(yearHint))}
          </p>
        </div>
      )}
      <div>
        <label className={labelClass} htmlFor="class_level">{t('classes.educationLevel', lang)}</label>
        <input id="class_level" name="education_level" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="class_group">{t('classes.groupDept', lang)}</label>
        <input id="class_group" name="group_department" className={inputClass} />
      </div>
      {shiftChoices.length > 0 && (
        <div>
          <label className={labelClass} htmlFor="class_shift">{t('classes.shift', lang)}</label>
          <select id="class_shift" name="shift" defaultValue="" className={selectClass()}>
            <option value="">{t('institute.selectOne', lang)}</option>
            {shiftChoices.map((shift) => (
              <option key={shift} value={shift}>
                {t(ACADEMIC_SHIFT_LABEL_KEY[shift], lang)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="sm:col-span-4">
        <label className={labelClass} htmlFor="class_teacher">{t('classes.classTeacher', lang)}</label>
        {/* Required once the school has any Employee to pick — mandatory as a
            product rule (#435), but never a wall in front of a brand-new school
            that has not entered its staff yet. */}
        <select
          id="class_teacher"
          name="class_teacher_id"
          required={teachers.length > 0}
          defaultValue=""
          className={selectClass()}
        >
          <option value="">{t('classes.classTeacherNone', lang)}</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.full_name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-4`}>
        {t('classes.addClass', lang)}
      </button>
    </form>
  )
}

/** "Copy Classes from {year}" — the Class Offerings list-header action (map
 *  #609, T8/#617). Clones a started prior Academic Year's Class Offerings into
 *  the active year through `copy_class_offerings_to_active_year` (T7/#616), which
 *  owns all authorization / validation / duplicate / concurrency safety — this
 *  control adds no client-side dedupe. The page renders it only when a started
 *  year before the active one has at least one Offering to copy. */
export function CopyClassesControl({
  lang,
  activeYear,
  sourceYears,
}: {
  lang: Lang
  activeYear: number
  /** Started years strictly before `activeYear`, newest first, each with its
   *  Offering count — already computed and gated by the page. Never empty here. */
  sourceYears: CopySourceYear[]
}) {
  const [sourceYear, setSourceYear] = useState(
    () => defaultCopySourceYear(sourceYears) ?? sourceYears[0]?.year ?? activeYear,
  )
  const [result, setResult] = useState<CopyResult | null>(null)

  // One prior year -> no selector, the year rides the button label instead.
  const showSelector = sourceYears.length > 1
  const confirmBody = t('classes.copyConfirmBody', lang)
    .replace('{source}', String(sourceYear))
    .replace('{active}', String(activeYear))

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSelector && (
        <select
          aria-label={t('classes.copySourceLabel', lang)}
          value={sourceYear}
          onChange={(e) => {
            setSourceYear(Number(e.target.value))
            setResult(null)
          }}
          className={selectClass()}
        >
          {sourceYears.map((s) => (
            <option key={s.year} value={s.year}>
              {s.year}
            </option>
          ))}
        </select>
      )}
      <ConfirmDialog
        triggerLabel={t('classes.copyClasses', lang).replace('{year}', String(sourceYear))}
        triggerClassName="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        title={t('classes.copyClasses', lang).replace('{year}', String(sourceYear))}
        body={confirmBody}
        confirmLabel={t('classes.copyConfirm', lang)}
        cancelLabel={t('routine.cancel', lang)}
        onConfirm={async () => {
          const res = await copyClassesFromYear(sourceYear)
          if ('error' in res) return { error: res.error }
          setResult(res)
        }}
      />
      {result && (
        <CopyResultPanel
          lang={lang}
          sourceYear={sourceYear}
          activeYear={activeYear}
          result={result}
          onDismiss={() => setResult(null)}
        />
      )}
    </div>
  )
}

function CopyResultPanel({
  lang,
  sourceYear,
  activeYear,
  result,
  onDismiss,
}: {
  lang: Lang
  sourceYear: number
  activeYear: number
  result: CopyResult
  onDismiss: () => void
}) {
  const kind = copyOutcomeKind(result)
  const heading = t('classes.copyResultHeading', lang)
    .replace('{source}', String(sourceYear))
    .replace('{active}', String(activeYear))
  return (
    <div role="status" className="w-full rounded-md border border-line bg-paper-muted p-3 text-sm">
      <p className="font-semibold text-ink">{heading}</p>
      <p>{t('classes.copyCopied', lang).replace('{n}', String(result.copied))}</p>
      <p>{t('classes.copySkipped', lang).replace('{n}', String(result.skipped))}</p>
      {kind === 'none' && (
        <p className="mt-1 text-muted">
          {t('classes.copyNoneHint', lang)
            .replace('{source}', String(sourceYear))
            .replace('{active}', String(activeYear))}
        </p>
      )}
      {kind === 'partial' && (
        <p className="mt-1 text-muted">
          {t('classes.copySkippedHint', lang)
            .replace('{n}', String(result.skipped))
            .replace('{active}', String(activeYear))}
        </p>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
      >
        {t('classes.copyDismiss', lang)}
      </button>
    </div>
  )
}

export function AddSubjectForm({
  lang,
  classes,
  showYear = false,
}: {
  lang: Lang
  classes: ClassCatalogueRow[]
  /** Append the Academic Year segment to each Class option's label — set by
   *  the page when the School spans more than one started year (map #609), so
   *  two same-name Offerings in different years are told apart in the picker. */
  showYear?: boolean
}) {
  const [classId, setClassId] = useState('')
  // Bumped on a successful add to remount the Combobox — its typed text is
  // Base UI's own internal state, not a plain DOM value, so the form's native
  // `reset()` can't be relied on to clear it the way it clears the other
  // fields; a key remount guarantees a fresh, empty field every time.
  const [subjectFieldKey, setSubjectFieldKey] = useState(0)
  const { error, pending, onSubmit } = useSubmit(addSubject, () => {
    setClassId('')
    setSubjectFieldKey((k) => k + 1)
  })
  const selectedClass = classes.find((c) => c.id === classId) ?? null
  const suggestions = useMemo(() => subjectSuggestionsForClass(selectedClass), [selectedClass])

  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={onSubmit}>
      <div>
        <label className={labelClass} htmlFor="subject_class">{t('classes.class', lang)}</label>
        <select
          id="subject_class"
          name="class_id"
          required
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className={selectClass({ size: 'md', fullWidth: true })}
        >
          <option value="" disabled>
            {t('classes.selectClass', lang)}
          </option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {classCatalogueLabel(c, showYear)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="subject_name">{t('classes.name', lang)}</label>
        <Combobox key={subjectFieldKey} items={suggestions} name="name" required>
          <ComboboxInputGroup>
            <ComboboxInput id="subject_name" />
            <ComboboxTrigger aria-label={t('classes.subjectSuggestions', lang)} />
          </ComboboxInputGroup>
          <ComboboxPopup empty={t('classes.subjectNoSuggestions', lang)}>
            {(subject: string) => <ComboboxItem key={subject} value={subject}>{subject}</ComboboxItem>}
          </ComboboxPopup>
        </Combobox>
      </div>
      <div>
        <label className={labelClass} htmlFor="subject_code">{t('classes.code', lang)}</label>
        <input id="subject_code" name="code" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="subject_theory">{t('classes.theory', lang)}</label>
        <input id="subject_theory" name="theory_marks" type="number" min={0} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="subject_mcq">{t('classes.mcq', lang)}</label>
        <input id="subject_mcq" name="mcq_marks" type="number" min={0} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="subject_practical">{t('classes.practical', lang)}</label>
        <input id="subject_practical" name="practical_marks" type="number" min={0} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="subject_papers">{t('classes.papers', lang)}</label>
        <input id="subject_papers" name="paper_count" type="number" min={1} max={4} defaultValue={1} className={inputClass} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-3">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-3`}>
        {t('classes.addSubject', lang)}
      </button>
    </form>
  )
}

export function DeleteButton({
  entity,
  id,
  lang,
}: {
  entity: 'class_offerings' | 'subjects'
  id: string
  lang: Lang
}) {
  // Deleting a class cascades to its subjects, and deleting a subject cascades
  // to its marks, its student questions and its routine links — say so in the
  // in-app dialog (#365, #548). "This will be deleted. Are you sure?" was true
  // and useless.
  const key = entity === 'class_offerings' ? 'classes.deleteConfirm' : 'classes.deleteConfirmSubject'
  return (
    <ConfirmDialog
      triggerLabel={t('common.delete', lang)}
      triggerClassName="cursor-pointer rounded-full border border-alert px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft"
      title={t('common.delete', lang)}
      body={t(key, lang)}
      confirmLabel={t('common.delete', lang)}
      cancelLabel={t('routine.cancel', lang)}
      onConfirm={async () => await removeItem(entity, id)}
    />
  )
}
