'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'
import { Field } from '@/components/ui/labeled-field'
import { mobileInputProps } from '@/lib/bd-mobile'
import { PERSON_NAME_MAX } from '@/lib/name'
import { compressImage, IMAGE_PRESETS } from '@/lib/image/compress'
import {
  photoExtension,
  nextRollNumber,
  nextRollNumberForOffering,
  type RollRow,
  type EnrollmentRollRow,
} from '@/lib/students'
import {
  classCatalogueLabel,
  classCatalogueOptions,
  findClassCatalogueId,
  resolveClassCatalogueSelection,
  type ClassCatalogueRow,
} from '@/lib/class-catalogue'
import { firstRelation } from '@/lib/supabase/relation'
import { admitStudent, studentPhotoUploadTicket, recordStudentPhoto } from '../actions'
import { recentAdmissions, type RecentAdmissionRow } from '../recent-admissions-actions'
import { saveAdmissionDraft, loadAdmissionDraft, clearAdmissionDraft } from './admission-draft'
import { dateInputClass } from '@/components/ui/field'
import { uploadWithSignedToken } from '@/lib/storage/upload-client'
import { knownVocabularyValue } from '@/lib/students/stored-labels'
import { Card as PageCard } from '@/components/ui/page'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { RowActionPill } from '@/components/data-table/row-action-pill'
import { ComboboxField } from '@/components/ui/combobox-field'
import { SelectField } from '@/components/ui/select-field'
import { DateField } from '@/components/ui/date-field'

const MAX_PHOTO_BYTES = 2 * 1024 * 1024 // mirrors the bucket's server-enforced cap

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

/** Religion is free text (grilled explicitly: no DB enum), but the form
 *  offers a curated dropdown ending in "Other" + a reveal text field so a
 *  typed answer isn't lost. Splits a stored value into the select's own
 *  choice and, only for a value the vocabulary doesn't recognize, the text
 *  that goes in the reveal field — mirrors how `class_name`/`section` above
 *  resolve from one dropdown into the fields the server actually reads. */
function splitReligionDefault(value: string) {
  const known = knownVocabularyValue('religion', value)
  if (known) return { choice: known, other: '' }
  return { choice: value ? 'other' : '', other: value }
}

export const fieldClass =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'
export const fieldLabelClass = 'mb-1 block text-xs font-semibold text-muted'

export function Card({
  title,
  children,
  id,
}: {
  title: string
  children: React.ReactNode
  /** Anchor for the admission form's step strip. */
  id?: string
}) {
  return (
    <section id={id} className="mb-4 scroll-mt-24 rounded-2xl border border-line bg-paper shadow-card">
      <h3 className="mx-5 mb-4 border-b border-line py-4 font-bold">{title}</h3>
      <div className="px-5 pb-5">{children}</div>
    </section>
  )
}

/** Shared admission-profile sections (Identity/Address/Guardian/Benefits/
 *  Previous/Sibling) — reused by the edit form on the detail page.
 *
 *  Class selection has two modes (map #568/#582, issue #586), both now
 *  rendered as ONE Class Catalogue-labelled dropdown (grilled explicitly,
 *  student-detail edit-form follow-up: option A — presentation only, no
 *  change to what either mode writes):
 *  - `classOfferings` for Admission's id-based Class Offering picker —
 *    submits `class_offering_id` directly, routed through
 *    admit_student_enrollment (actions.ts's admitStudent).
 *  - `classes` for the edit form's still-text-based class_name/section pair
 *    (updateStudent's direct profile-edit path was never proposed for
 *    retirement by #569-#574 — see 0180's own header comment, and this
 *    session's own ADR on the Enrollment-vs-text drift this path is
 *    accepted to still carry). The dropdown here is id-based only to build
 *    and disambiguate its OWN option list; the id itself is never
 *    submitted — on pick it resolves straight back to a plain
 *    `class_name`/`section` text pair via two hidden inputs, exactly the
 *    shape `updateStudent` already reads. Two Offerings sharing a name+
 *    section (differing by Shift/Year/Group) still resolve to the same
 *    text pair here, same as the two-select cascade this replaced — a
 *    pre-existing, not a new, ambiguity.
 *
 *  Exactly one of `classes`/`classOfferings` is expected per caller. */
export function ProfileFields({
  lang,
  classes,
  classOfferings,
  defaults = {},
  rolls = [],
  enrollmentRolls = [],
  rollIncrement = 1,
  suggestRoll = false,
  showYear = false,
}: {
  lang: Lang
  /** Edit mode: same Class Catalogue rows as `classOfferings`, rendered the
   *  same way, but still submitted as a class_name/section text pair
   *  instead of an id (map #568/#582, Wave 4a Part B — see this function's
   *  own doc comment for why). */
  classes?: ClassCatalogueRow[]
  /** Admission mode: the id-based Class Offering picker. */
  classOfferings?: ClassCatalogueRow[]
  defaults?: Record<string, string | boolean | number | null>
  /** Existing rolls (issue #503), used only to prefill a *new* admission's Roll
   *  Number field in text mode — the edit form already has a real roll in
   *  `defaults`. */
  rolls?: RollRow[]
  /** Existing enrollment rolls, the offering-mode analog of `rolls`. */
  enrollmentRolls?: EnrollmentRollRow[]
  rollIncrement?: number
  /** Only the admission form opts in — an edit-mode student's roll_number can
   *  legitimately be null (e.g. right after a section-only transfer), and
   *  `rolls`/`rollIncrement` are never fetched for that call site, so a
   *  suggestion computed there would be a meaningless "1" every time. */
  suggestRoll?: boolean
  /** Academic Year segment on the Class dropdown, both modes (issue #621,
   *  map #609's recipe) — true only when the School has more than one
   *  started Academic Year. */
  showYear?: boolean
}) {
  const d = (key: string) => String(defaults[key] ?? '')
  const usingOfferings = classOfferings !== undefined
  const offeringOptions = useMemo(
    () => (classOfferings ? classCatalogueOptions(classOfferings, showYear) : []),
    [classOfferings, showYear],
  )
  // Edit mode's own catalogue options — one Class Catalogue-labelled
  // dropdown, same as offeringOptions above; only the write path differs
  // (see this function's own doc comment).
  const classCatalogue = useMemo(() => (classes ? classCatalogueOptions(classes, showYear) : []), [classes, showYear])
  const [className, setClassName] = useState(d('class_name'))
  const [section, setSection] = useState(d('section'))
  // Offering mode has no text-pair default to seed from (edit mode's
  // className/section above cover that mode instead) — but a caller can
  // still carry a prior selection forward via defaults.class_offering_id
  // (AdmissionForm remounts with everything but the Class cleared, for rapid
  // back-to-back admission into the same Class).
  const [classOfferingId, setClassOfferingId] = useState(d('class_offering_id'))
  // The dropdown's own selection — an id purely to pick one option out of
  // the (possibly ambiguous by name+section alone) catalogue; resolved
  // immediately back to the className/section this mode actually submits.
  // Initialized from the edit form's existing text pair via
  // findClassCatalogueId so an in-progress edit still shows the right
  // option selected, even though `defaults` never carried an id.
  const [editComboId, setEditComboId] = useState(() =>
    findClassCatalogueId(classCatalogue, d('class_name'), d('section')),
  )
  const [religion, setReligion] = useState(() => splitReligionDefault(d('religion')))
  // Only className is required — an empty section is itself a valid scope
  // (a class with no sections at all, e.g. most Primary classes per
  // docs/012): nextRollNumber and assign_student_roll both treat "no
  // section" as a stable group, not as "nothing selected yet".
  const suggestedRoll = useMemo(() => {
    if (!suggestRoll) return null
    if (usingOfferings) {
      return classOfferingId ? nextRollNumberForOffering(enrollmentRolls, classOfferingId, rollIncrement) : null
    }
    return className ? nextRollNumber(rolls, className, section, rollIncrement) : null
  }, [suggestRoll, usingOfferings, enrollmentRolls, classOfferingId, rolls, className, section, rollIncrement])

  return (
    <>
      <Card id="admission-student" title={t('students.identity', lang)}>
        <div className="grid gap-grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <Field label={t('students.name', lang)}>
            <input name="full_name" required maxLength={PERSON_NAME_MAX} defaultValue={d('full_name')} className={fieldClass} />
          </Field>
          <Field label={t('students.dob', lang)}>
            <DateField lang={lang}
              name="date_of_birth"
              defaultValue={d('date_of_birth')}
              className={dateInputClass({ size: 'md', fullWidth: true })}
            />
          </Field>
          <Field label={t('students.gender', lang)} htmlFor="admission_gender">
            <SelectField
              id="admission_gender"
              name="gender"
              defaultValue={d('gender')}
              options={[
                { value: '', label: '—' },
                { value: 'male', label: t('students.male', lang) },
                { value: 'female', label: t('students.female', lang) },
                { value: 'third_gender', label: t('students.thirdGender', lang) },
              ]}
            />
          </Field>
          <Field label={t('students.bloodGroup', lang)} htmlFor="admission_blood_group">
            <ComboboxField
              id="admission_blood_group"
              name="blood_group"
              defaultValue={d('blood_group')}
              options={[
                { value: '', label: '—' },
                ...BLOOD_GROUPS.map((bg) => ({ value: bg, label: bg })),
              ]}
            />
          </Field>
          {usingOfferings ? (
            <Field label={t('students.class', lang)} htmlFor="admission_class_offering">
              {/* Admission mode (map #568/#582, #586): one id-based select —
                  the Class Offering already carries its own section, so
                  there's no second cascade step. Submits class_offering_id,
                  read by admitStudent and passed straight into
                  admit_student_enrollment; class_name/section are no longer
                  part of this form's submission. */}
              <ComboboxField
                id="admission_class_offering"
                name="class_offering_id"
                value={classOfferingId}
                onValueChange={setClassOfferingId}
                options={[
                  { value: '', label: '—' },
                  ...offeringOptions.map((o) => ({ value: o.value, label: o.label })),
                ]}
              />
            </Field>
          ) : (
            <Field label={t('students.class', lang)} htmlFor="admission_class_edit">
              {/* Edit mode (grilled explicitly, option A): one Class
                  Catalogue-labelled select, same shape as every other
                  Offering picker in the app. Its own value is an id, purely
                  to disambiguate the option list — never submitted. Picking
                  one resolves straight to the className/section hidden
                  inputs below, so updateStudent's payload is byte-identical
                  in shape to the two-select cascade this replaced. */}
              <ComboboxField
                id="admission_class_edit"
                value={editComboId}
                onValueChange={(id) => {
                  setEditComboId(id)
                  const resolved = resolveClassCatalogueSelection(classCatalogue, id)
                  setClassName(resolved.className)
                  setSection(resolved.section)
                }}
                options={[
                  { value: '', label: '—' },
                  ...classCatalogue.map((c) => ({ value: c.value, label: c.label })),
                ]}
              />
              <input type="hidden" name="class_name" value={className} />
              <input type="hidden" name="section" value={section} />
            </Field>
          )}
          <Field label={t('students.roll', lang)}>
            {/* key remounts on class/section (or Offering) change so a manual
                entry made for the old scope can't linger. In edit mode,
                d('roll_number') is the *original* student record — it only
                stays the default once className/section have moved away from
                that original class+section (a genuine scope change), so a
                class edit forces a conscious re-entry instead of silently
                reattaching the old roll to a new class+section. In offering
                (admission) mode, d('roll_number') is only ever a same-scope
                value too — either absent (the post-save reset's defaults
                carry no roll_number) or a same-Offering draft restore (issue
                #628, whose own remount already happens above on Offering
                change) — so it's always safe to read here, never a stale
                cross-scope leftover. The suggestion itself is a *placeholder*,
                not a prefilled value: left blank, the field submits null and
                the appropriate advisory-locked max()+increment trigger
                (assign_student_roll in text mode, assign_enrollment_roll in
                offering mode) safely serializes concurrent admissions —
                submitting the guessed number as a real value would instead
                race two simultaneous admissions for the same roll. In
                offering mode the scope check is classOfferingId === the
                Offering the draft/edit default was recorded for — same
                purpose as the className/section pair below, just keyed by
                id instead of a text pair. */}
            <input
              key={usingOfferings ? classOfferingId : JSON.stringify([className, section])}
              type="number"
              name="roll_number"
              min={1}
              defaultValue={
                usingOfferings
                  ? classOfferingId === d('class_offering_id')
                    ? d('roll_number')
                    : ''
                  : className === d('class_name') && section === d('section')
                    ? d('roll_number')
                    : ''
              }
              placeholder={suggestedRoll !== null ? String(suggestedRoll) : undefined}
              className={fieldClass}
            />
            {suggestRoll && (
              <p className="mt-1 text-xs text-muted">
                {t('students.rollAutoNote', lang)}{' '}
                <Link href="/school/institute?section=roll-numbering" className="text-brand-600 hover:underline">
                  {t('students.rollNumberingLink', lang)}
                </Link>
              </p>
            )}
          </Field>
          <Field label={t('students.religion', lang)} htmlFor="admission_religion">
            <ComboboxField
              id="admission_religion"
              value={religion.choice}
              onValueChange={(v) => setReligion({ choice: v, other: religion.other })}
              options={[
                { value: '', label: '—' },
                { value: 'islam', label: t('students.islam', lang) },
                { value: 'hinduism', label: t('students.hinduism', lang) },
                { value: 'christianity', label: t('students.christianity', lang) },
                { value: 'buddhism', label: t('students.buddhism', lang) },
                { value: 'other', label: t('students.otherReligion', lang) },
              ]}
            />
            {religion.choice === 'other' && (
              <input
                value={religion.other}
                onChange={(e) => setReligion({ choice: 'other', other: e.target.value })}
                placeholder={t('students.religionSpecify', lang)}
                className={`${fieldClass} mt-2`}
              />
            )}
            <input
              type="hidden"
              name="religion"
              value={religion.choice === 'other' ? religion.other : religion.choice}
            />
          </Field>
          <Field label={t('students.studentMobile', lang)}>
            <input
              name="student_mobile"
              defaultValue={d('student_mobile')}
              className={fieldClass}
              placeholder="01xxxxxxxxx"
              {...mobileInputProps(d('student_mobile'), t('people.errMobileInvalid', lang))}
            />
          </Field>
        </div>
      </Card>

      <Card title={t('students.address', lang)}>
        <Field label={t('students.address', lang)}>
          <input
            name="address"
            defaultValue={d('address')}
            placeholder={t('students.addressPlaceholder', lang)}
            className={fieldClass}
          />
        </Field>
      </Card>

      <Card id="admission-guardian" title={t('students.guardianInfo', lang)}>
        <div className="grid gap-grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <Field label={t('students.guardianName', lang)}>
            <input name="guardian_name" defaultValue={d('guardian_name')} className={fieldClass} />
          </Field>
          <Field label={t('students.relation', lang)} htmlFor="admission_guardian_relation">
            <ComboboxField
              id="admission_guardian_relation"
              name="guardian_relation"
              defaultValue={d('guardian_relation')}
              options={[
                { value: '', label: '—' },
                { value: 'father', label: t('students.father', lang) },
                { value: 'mother', label: t('students.mother', lang) },
                { value: 'brother', label: t('students.brother', lang) },
                { value: 'sister', label: t('students.sister', lang) },
                { value: 'grandfather', label: t('students.grandfather', lang) },
                { value: 'grandmother', label: t('students.grandmother', lang) },
                { value: 'uncle', label: t('students.uncle', lang) },
                { value: 'aunty', label: t('students.aunty', lang) },
                { value: 'other', label: t('students.otherRelation', lang) },
              ]}
            />
          </Field>
          <Field label={t('students.guardianMobile', lang)}>
            <input
              name="guardian_mobile"
              defaultValue={d('guardian_mobile')}
              className={fieldClass}
              placeholder="01xxxxxxxxx"
              {...mobileInputProps(d('guardian_mobile'), t('people.errMobileInvalid', lang))}
            />
          </Field>
          <Field label={t('students.guardianNid', lang)}>
            <input name="guardian_nid" defaultValue={d('guardian_nid')} className={fieldClass} />
          </Field>
        </div>
      </Card>

      <Card id="admission-history" title={t('students.benefitFlags', lang)}>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_freedom_fighter_child"
              defaultChecked={defaults.is_freedom_fighter_child === true}
            />
            {t('students.freedomFighterChild', lang)}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_indigenous" defaultChecked={defaults.is_indigenous === true} />
            {t('students.indigenous', lang)}
          </label>
        </div>
      </Card>

      <Card title={t('students.previousInstitute', lang)}>
        <div className="grid gap-grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <Field label={t('students.previousInstituteName', lang)}>
            <input name="previous_institute" defaultValue={d('previous_institute')} className={fieldClass} />
          </Field>
          <Field label={t('students.previousClass', lang)}>
            <input name="previous_class" defaultValue={d('previous_class')} className={fieldClass} />
          </Field>
        </div>
      </Card>

      <Card title={t('students.siblingInfo', lang)}>
        <Field label={t('students.siblingDetails', lang)}>
          <textarea name="sibling_info" rows={2} defaultValue={d('sibling_info')} className={fieldClass} />
        </Field>
      </Card>
    </>
  )
}

/** Uploads the picked photo for a student: server-derived path, client-direct
 *  bytes to the private bucket, then records photo_path on the row. */
export async function uploadStudentPhoto(studentId: string, file: File, lang: Lang): Promise<string | null> {
  if (!photoExtension(file.type)) return t('students.photoType', lang)
  // Compress before the size check so large phone photos fit the 2 MB bucket cap.
  const photo = await compressImage(file, IMAGE_PRESETS.studentPhoto)
  if (photo.size > MAX_PHOTO_BYTES) return t('students.photoTooBig', lang)
  const { upload, error: pathErr } = await studentPhotoUploadTicket(studentId, photo.type)
  if (pathErr || !upload) return pathErr ?? 'Upload failed'
  const { error: upErr } = await uploadWithSignedToken('student-photos', upload, photo, photo.type)
  if (upErr) return upErr
  const res = await recordStudentPhoto(studentId, photo.type)
  return res.error ?? null
}

// The two ProfileFields checkboxes: FormData only carries their name when
// checked (value "on"), so an unchecked box leaves no entry at all — the
// draft snapshot reflects that, and this turns it back into the boolean
// `defaults.is_x === true` check those checkboxes' `defaultChecked` reads.
const DRAFT_CHECKBOX_FIELDS = ['is_freedom_fighter_child', 'is_indigenous'] as const

function draftDefaults(draft: Record<string, string> | null): Record<string, string | boolean> {
  if (!draft) return {}
  const defaults: Record<string, string | boolean> = { ...draft }
  for (const key of DRAFT_CHECKBOX_FIELDS) {
    defaults[key] = draft[key] === 'on'
  }
  return defaults
}

/** Recent Admissions' Class cell (issue #640): the full Class Catalogue
 *  label, same convention Students List already uses (`classLabelFor` in
 *  app/school/students/page.tsx). Falls back to the legacy class_name/section
 *  pair when a row has no current enrollment (offering null): unlike the full
 *  Students List, where "unplaced" is a real status worth showing as blank,
 *  this is a narrow "what did we just admit" list where every row should show
 *  something. The fallback goes through classCatalogueLabel too, so both
 *  paths read "Name - Section" rather than one of them "Name / Section". */
function recentAdmissionClassLabel(row: RecentAdmissionRow, showYear: boolean): string | null {
  const enrollment = firstRelation(row.student_enrollments)
  const offering = enrollment ? firstRelation(enrollment.class_offerings) : null
  if (offering) return classCatalogueLabel(offering, showYear)
  return row.class_name ? classCatalogueLabel({ name: row.class_name, section: row.section }) : null
}

export function AdmissionForm({
  lang,
  schoolId,
  userId,
  classOfferings,
  enrollmentRolls = [],
  rollIncrement = 1,
  showYear = false,
  initialRecent,
}: {
  lang: Lang
  /** Scope the draft (issue #628) to this school + user, so it never leaks
   *  across different Staff Users on a shared browser. */
  schoolId: string
  userId: string
  classOfferings: ClassCatalogueRow[]
  enrollmentRolls?: EnrollmentRollRow[]
  rollIncrement?: number
  showYear?: boolean
  /** The real last 10 admissions (issue #625) — fetched server-side by
   *  `page.tsx` for the initial render, then re-fetched here after every
   *  save so the list never drifts into a session-local echo. */
  initialRecent: RecentAdmissionRow[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Unfinished-admission draft (issue #628): read once at mount, restored
  // below as ProfileFields' initial `defaults` only on the very first
  // generation — after a save, `formGeneration`'s own reset-for-next-entry
  // (see below) is what should apply, not a now-cleared draft.
  const [draft] = useState(() => loadAdmissionDraft(schoolId, userId))

  // Rapid bulk admission (grilled explicitly): saving stays on this page
  // instead of navigating to the new Student's detail page, so admitting ~100
  // students in a row never leaves the form. `formGeneration` remounts
  // ProfileFields after each save — the only way to clear its uncontrolled
  // inputs (defaultValue-based) short of a page reload — while `lastClassOfferingId`
  // is fed back in as the ONLY carried-over default (Q2: same Class, blank
  // everything else, since Guardian fields being sticky risks silently
  // reusing the previous student's guardian on a genuinely new admission).
  const [formGeneration, setFormGeneration] = useState(0)
  const [lastClassOfferingId, setLastClassOfferingId] = useState('')
  // Seeds ProfileFields' roll-number placeholder same as a fresh page load
  // would, then grows by one synthetic row per save so the placeholder keeps
  // reflecting the true next roll through the whole batch — the fetched list
  // never changes underneath us since navigation never happens.
  const [enrollmentRollsState, setEnrollmentRollsState] = useState<EnrollmentRollRow[]>(enrollmentRolls)
  const [lastSaved, setLastSaved] = useState<{
    name: string
    roll: number | null
  } | null>(null)
  // Server-sourced (issue #625): seeded from page.tsx's own fetch for the
  // initial render, replaced wholesale (never appended-to locally) after
  // each save so it's always the real last 10, not a session-local echo.
  const [recent, setRecent] = useState<RecentAdmissionRow[]>(initialRecent)
  const dash = <span className="text-muted">—</span>
  const recentColumns: Column<RecentAdmissionRow>[] = [
    { key: 'roll', header: t('students.roll', lang), cell: (s) => s.roll_number ?? dash },
    {
      key: 'name',
      header: t('students.name', lang),
      card: 'title',
      cell: (s) => <span className="font-semibold">{s.full_name}</span>,
    },
    { key: 'class', header: t('students.classSection', lang), cell: (s) => recentAdmissionClassLabel(s, showYear) ?? dash },
    { key: 'guardian', header: t('students.guardian', lang), cell: (s) => s.guardian_name ?? dash },
  ]

  // Section jump links styled as the reference's step strip. Layout only: the
  // form is still one page and one submit.
  const steps = [
    {
      href: '#admission-student',
      title: 'students.admissionStepStudent',
      hint: 'students.admissionStepStudentHint',
    },
    {
      href: '#admission-guardian',
      title: 'students.admissionStepGuardian',
      hint: 'students.admissionStepGuardianHint',
    },
    {
      href: '#admission-history',
      title: 'students.admissionStepHistory',
      hint: 'students.admissionStepHistoryHint',
    },
    {
      href: '#admission-photo',
      title: 'students.admissionStepPhoto',
      hint: 'students.admissionStepPhotoHint',
    },
  ] as const
  const numFmt = new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-US')

  return (
    <form
      ref={formRef}
      noValidate // the server validates and answers in the UI language into the error line
      onChange={() => {
        // Silent autosave (issue #628) — every field change snapshots the
        // whole form to localStorage, so a nav-away (sidebar, browser back)
        // doesn't lose in-progress work. Only Save success or Cancel clears
        // it, both below. Debounced so a full-form FormData scan + stringify
        // + write doesn't run on literally every keystroke — a real cost
        // across a ~20-field form repeated per student during rapid bulk
        // admission.
        if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
        draftSaveTimer.current = setTimeout(() => {
          if (formRef.current) saveAdmissionDraft(schoolId, userId, formRef.current)
        }, 400)
      }}
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        const fullName = String(data.get('full_name') ?? '').trim()
        const classOfferingId = String(data.get('class_offering_id') ?? '').trim()
        startTransition(async () => {
          setError(null)
          const result = await admitStudent(data)
          if (!result.id) {
            setError(result.error ?? 'Save failed')
            return
          }
          // An id means the Student exists — anything reported alongside it is
          // a non-fatal follow-up problem (e.g. the roll number failing to
          // sync). Stranding the operator on the form would invite a resubmit
          // that creates a duplicate, so this is surfaced as a console warning
          // the same way a photo failure below is.
          if (result.error) console.warn('admission warning:', result.error)
          const photo = photoRef.current?.files?.[0]
          if (photo) {
            const photoError = await uploadStudentPhoto(result.id, photo, lang)
            // The admission itself succeeded; a photo problem shouldn't strand
            // the user on the form — it can be re-uploaded from the profile.
            if (photoError) console.warn('photo upload failed:', photoError)
          }

          // Reset for the next entry FIRST — rapid bulk admission is the
          // whole point of this page, so nothing after the admission itself
          // succeeded should make the operator wait before typing the next
          // student. The Recent Admissions refresh below is a background
          // update, not a gate on that.
          clearAdmissionDraft(schoolId, userId)
          setLastSaved({ name: fullName, roll: result.roll_number ?? null })
          if (classOfferingId) {
            setEnrollmentRollsState((prev) => [
              ...prev,
              {
                class_offering_id: classOfferingId,
                roll_number: result.roll_number ?? null,
              },
            ])
          }
          setLastClassOfferingId(classOfferingId)
          setFormGeneration((g) => g + 1)

          // Best-effort: the admission already succeeded and the form
          // already reset, so a transient failure here shouldn't be fatal —
          // the list just stays one save behind until the next successful
          // refresh (or a manual reload).
          try {
            setRecent(await recentAdmissions())
          } catch (err) {
            console.warn('recent admissions refresh failed:', err)
          }
        })
      }}
    >
      {lastSaved && (
        <p className="mb-3 rounded-md border border-mint-soft bg-mint-soft/40 px-3 py-2 text-sm text-mint-deep">
          {t('students.lastSaved', lang)}: {lastSaved.name}
          {lastSaved.roll !== null && ` — ${t('students.roll', lang)} ${lastSaved.roll}`}
        </p>
      )}

      <nav
        aria-label={t('students.admissionTitle', lang)}
        className="mb-4 rounded-2xl border border-line bg-paper p-3 shadow-card"
      >
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.href}>
              <a
                href={s.href}
                className="flex items-center gap-3 rounded-xl bg-paper-muted p-3 transition hover:bg-brand-50"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                  {numFmt.format(i + 1)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t(s.title, lang)}</span>
                  <span className="block truncate text-xs text-muted">{t(s.hint, lang)}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <ProfileFields
            key={formGeneration}
            lang={lang}
            classOfferings={classOfferings}
            // Generation 0 restores the unsaved draft, if any (issue #628); every
            // later generation is a post-save reset, which only carries the Class
            // forward — the draft was already cleared at that point.
            defaults={formGeneration === 0 ? draftDefaults(draft) : { class_offering_id: lastClassOfferingId }}
            enrollmentRolls={enrollmentRollsState}
            rollIncrement={rollIncrement}
            suggestRoll
            showYear={showYear}
          />

          <Card id="admission-photo" title={t('students.photo', lang)}>
            <Field label={t('students.uploadPhoto', lang)}>
              <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className={fieldClass} />
            </Field>
            <p className="mt-1 text-xs text-muted">{t('students.photoHint', lang)}</p>
          </Card>

          {error && <p className="mb-3 text-sm text-alert-deep">{error}</p>}

          {/* Sticky action bar: stays in reach while scrolling a long form. */}
          <div className="sticky bottom-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper/95 p-3 shadow-card backdrop-blur">
            <span className="flex items-center gap-2 text-xs font-semibold text-mint-deep">
              <span aria-hidden className="size-2 rounded-full bg-mint-deep" />
              {t('students.draftAutosaved', lang)}
            </span>
            <div className="flex items-center gap-2">
              <Link
                href="/school/students"
                onClick={() => clearAdmissionDraft(schoolId, userId)}
                className="rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted"
              >
                {t('routine.cancel', lang)}
              </Link>
              <button
                type="submit"
                disabled={pending}
                className="cursor-pointer rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {t('students.saveAdmission', lang)}
              </button>
            </div>
          </div>
        </div>

        <aside className="rounded-2xl border border-line bg-paper p-5 shadow-card lg:sticky lg:top-4">
          <h3 className="mb-3 border-b border-line pb-3 font-bold">{t('students.afterAdmission', lang)}</h3>
          <ol className="space-y-3 text-sm">
            {(
              [
                'students.afterAdmission1',
                'students.afterAdmission2',
                'students.afterAdmission3',
                'students.afterAdmission4',
              ] as const
            ).map((key, i) => (
              <li key={key} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                  {numFmt.format(i + 1)}
                </span>
                <span className="text-muted">{t(key, lang)}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {/* Same DataTable + heading shape as SMS Rules' read-only lists — phone
          cards / desktop table come with it. No search/filters/pagination:
          it's always the last 10. */}
      <section>
        <h2 className="mb-3 text-lg font-bold">{t('students.recentAdmissions', lang)}</h2>
        <DataTable
          rows={recent}
          rowId={(s) => s.id}
          rowLabel={(s) => s.full_name}
          columns={recentColumns}
          lang={lang}
          params={{}}
          caption={t('students.recentAdmissions', lang)}
          rowActions={(s) => (
            <RowActionPill state="default" href={`/school/students/${s.id}`} label={t('students.view', lang)} />
          )}
          empty={
            <PageCard>
              <p className="text-sm text-muted">{t('students.recentAdmissionsEmpty', lang)}</p>
            </PageCard>
          }
        />
      </section>
    </form>
  )
}
