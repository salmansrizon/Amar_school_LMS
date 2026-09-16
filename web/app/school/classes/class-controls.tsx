'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { ACADEMIC_SHIFT_LABEL_KEY, GROUP_DEPARTMENTS, type AcademicShift } from '@/lib/institute'
import { Modal } from '@/components/modal'
import { addClass, addSubject, archiveClassOffering, copyClassesFromYear, removeItem } from './actions'
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

export interface EducationLevelOption {
  key: string
  label: { bn: string; en: string }
}

export function AddClassForm({
  lang,
  teachers,
  shiftChoices = [],
  activeAcademicYear = null,
  educationLevels,
  groupDepartmentOptions = [],
  onCreated,
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
  /** This School's own configured Education Levels (issue #633), already
   *  filtered from the full platform vocabulary by the caller
   *  (`configuredEducationLevelOptions`). Empty means the School hasn't
   *  configured any yet — Add Class is blocked entirely rather than falling
   *  back to the full vocabulary. */
  educationLevels: EducationLevelOption[]
  /** This School's previously-submitted custom Group/Department values
   *  (issue #635, ADR 0025), oldest first — offered in the dropdown above
   *  Other, below the three built-ins. */
  groupDepartmentOptions?: string[]
  /** Called after a successful save so a modal caller can close itself
   *  (issue #632). */
  onCreated?: () => void
}) {
  const [groupDept, setGroupDept] = useState<{ choice: string; other: string }>({ choice: '', other: '' })
  const { error, pending, onSubmit } = useSubmit(addClass, () => {
    setGroupDept({ choice: '', other: '' })
    onCreated?.()
  })
  const yearHint = newClassYearHint(activeAcademicYear)

  if (educationLevels.length === 0) {
    return (
      <div className="rounded-md border border-line bg-paper-muted p-4 text-sm">
        <p className="text-muted">{t('classes.educationLevelNotConfigured', lang)}</p>
        <Link href="/school/institute" className="mt-2 inline-block font-semibold text-brand-600 hover:underline">
          {t('institute.title', lang)}
        </Link>
      </div>
    )
  }

  return (
    <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
      {yearHint != null && (
        <div className="rounded-md border border-line bg-paper-muted p-3 text-sm font-semibold text-ink sm:col-span-2">
          {/* Read-only confirmation — no form field. addClass stamps the year
              server-side (map #609, T9/#618); the creation flow cannot place an
              Offering under an older year. Shown first (issue #634) so it's the
              first thing read when the panel opens. */}
          {t('classes.newClassYear', lang).replace('{year}', String(yearHint))}
        </div>
      )}
      <div>
        <label className={labelClass} htmlFor="class_name">{t('classes.name', lang)}</label>
        <input id="class_name" name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="class_section">{t('classes.section', lang)}</label>
        <input id="class_section" name="section" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="class_level">{t('classes.educationLevel', lang)}</label>
        <select
          id="class_level"
          name="education_level"
          defaultValue=""
          className={selectClass({ size: 'md', fullWidth: true })}
        >
          <option value="">{t('institute.selectOne', lang)}</option>
          {educationLevels.map((lvl) => (
            <option key={lvl.key} value={lvl.key}>
              {lvl.label[lang]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="class_group">{t('classes.groupDept', lang)}</label>
        <select
          id="class_group"
          value={groupDept.choice}
          onChange={(e) => setGroupDept({ choice: e.target.value, other: groupDept.other })}
          className={selectClass({ size: 'md', fullWidth: true })}
        >
          <option value="">{t('institute.selectOne', lang)}</option>
          {GROUP_DEPARTMENTS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option disabled>──────────</option>
          {groupDepartmentOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value="other">{t('classes.groupOther', lang)}</option>
        </select>
        {groupDept.choice === 'other' && (
          <input
            value={groupDept.other}
            onChange={(e) => setGroupDept({ choice: 'other', other: e.target.value })}
            placeholder={t('classes.groupOtherSpecify', lang)}
            className={`${inputClass} mt-2`}
          />
        )}
        <input
          type="hidden"
          name="group_department"
          value={groupDept.choice === 'other' ? groupDept.other.trim() : groupDept.choice}
        />
      </div>
      {shiftChoices.length > 0 && (
        <div>
          <label className={labelClass} htmlFor="class_shift">{t('classes.shift', lang)}</label>
          <select
            id="class_shift"
            name="shift"
            defaultValue=""
            className={selectClass({ size: 'md', fullWidth: true })}
          >
            <option value="">{t('institute.selectOne', lang)}</option>
            {shiftChoices.map((shift) => (
              <option key={shift} value={shift}>
                {t(ACADEMIC_SHIFT_LABEL_KEY[shift], lang)}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* Pairs with Shift on one row (issue #636); goes full-width only when
          there's no Shift field beside it to pair with (a No-Shift School),
          rather than sitting alone at half-width with empty space beside it. */}
      <div className={shiftChoices.length > 0 ? undefined : 'sm:col-span-2'}>
        <label className={labelClass} htmlFor="class_teacher">{t('classes.classTeacher', lang)}</label>
        {/* Required once the school has any Employee to pick — mandatory as a
            product rule (#435), but never a wall in front of a brand-new school
            that has not entered its staff yet. */}
        <select
          id="class_teacher"
          name="class_teacher_id"
          required={teachers.length > 0}
          defaultValue=""
          className={selectClass({ size: 'md', fullWidth: true })}
        >
          <option value="">{t('classes.classTeacherNone', lang)}</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.full_name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-2`}>
        {t('classes.addClass', lang)}
      </button>
    </form>
  )
}

/** Wraps AddClassForm in the Add Class modal (issue #632). Composed here,
 *  inside this already-client module, rather than in the server-rendered
 *  page: Modal's `children` is a render-prop function, and a Server
 *  Component cannot pass a function across the RSC boundary into a Client
 *  Component's props — only the page's own plain, serializable data
 *  (teachers, shiftChoices, etc.) may cross that line. */
export function AddClassModal({
  lang,
  teachers,
  shiftChoices,
  activeAcademicYear,
  educationLevels,
  groupDepartmentOptions,
  triggerLabel,
  triggerClassName,
  title,
}: {
  lang: Lang
  teachers: TeacherOption[]
  shiftChoices: readonly AcademicShift[]
  activeAcademicYear: number | null
  educationLevels: EducationLevelOption[]
  groupDepartmentOptions: string[]
  triggerLabel: string
  triggerClassName: string
  title: string
}) {
  return (
    <Modal lang={lang} triggerLabel={triggerLabel} triggerClassName={triggerClassName} title={title}>
      {(close) => (
        <AddClassForm
          lang={lang}
          teachers={teachers}
          shiftChoices={shiftChoices}
          activeAcademicYear={activeAcademicYear}
          educationLevels={educationLevels}
          groupDepartmentOptions={groupDepartmentOptions}
          onCreated={close}
        />
      )}
    </Modal>
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
  onCreated,
}: {
  lang: Lang
  classes: ClassCatalogueRow[]
  /** Append the Academic Year segment to each Class option's label — set by
   *  the page when the School spans more than one started year (map #609), so
   *  two same-name Offerings in different years are told apart in the picker. */
  showYear?: boolean
  /** Called after a successful save so a modal caller can close itself
   *  (issue #639, mirrors AddClassForm's onCreated from issue #632). */
  onCreated?: () => void
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
    onCreated?.()
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

/** Wraps AddSubjectForm in a modal (issue #639), mirroring AddClassModal
 *  (issue #632) — composed here for the same reason: Modal's `children` is a
 *  render-prop function that cannot cross the RSC boundary from the
 *  server-rendered page. */
export function AddSubjectModal({
  lang,
  classes,
  showYear,
  triggerLabel,
  triggerClassName,
  title,
}: {
  lang: Lang
  classes: ClassCatalogueRow[]
  showYear?: boolean
  triggerLabel: string
  triggerClassName: string
  title: string
}) {
  return (
    <Modal lang={lang} triggerLabel={triggerLabel} triggerClassName={triggerClassName} title={title}>
      {(close) => (
        <AddSubjectForm lang={lang} classes={classes} showYear={showYear} onCreated={close} />
      )}
    </Modal>
  )
}

export function DeleteButton({
  entity,
  id,
  lang,
}: {
  entity: 'subjects'
  id: string
  lang: Lang
}) {
  // Deleting a subject cascades to its marks, its student questions and its
  // routine links — say so in the in-app dialog (#365, #548). "This will be
  // deleted. Are you sure?" was true and useless.
  return (
    <ConfirmDialog
      triggerLabel={t('common.delete', lang)}
      triggerClassName="cursor-pointer rounded-full border border-alert px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft"
      title={t('common.delete', lang)}
      body={t('classes.deleteConfirmSubject', lang)}
      confirmLabel={t('common.delete', lang)}
      cancelLabel={t('routine.cancel', lang)}
      onConfirm={async () => await removeItem(entity, id)}
    />
  )
}

/** A Class Offering's own action (ADR 0024): fresh (never used, per
 *  `usedClassOfferingIds`) still gets the plain permanent Delete; a used one
 *  gets Archive instead — Delete is never even offered, so the raw
 *  FK-violation error a used Offering used to surface can no longer happen
 *  from this button (the server action re-checks too, as a backstop). */
export function ArchiveOrDeleteButton({
  classOfferingId,
  used,
  lang,
}: {
  classOfferingId: string
  used: boolean
  lang: Lang
}) {
  if (used) {
    return (
      <ConfirmDialog
        triggerLabel={t('classes.archive', lang)}
        triggerClassName="cursor-pointer rounded-full border border-alert px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft"
        title={t('classes.archive', lang)}
        body={t('classes.archiveConfirm', lang)}
        confirmLabel={t('classes.archive', lang)}
        cancelLabel={t('routine.cancel', lang)}
        onConfirm={async () => await archiveClassOffering(classOfferingId)}
      />
    )
  }
  return (
    <ConfirmDialog
      triggerLabel={t('common.delete', lang)}
      triggerClassName="cursor-pointer rounded-full border border-alert px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft"
      title={t('common.delete', lang)}
      body={t('classes.deleteConfirmSimple', lang)}
      confirmLabel={t('common.delete', lang)}
      cancelLabel={t('routine.cancel', lang)}
      onConfirm={async () => await removeItem('class_offerings', classOfferingId)}
    />
  )
}
