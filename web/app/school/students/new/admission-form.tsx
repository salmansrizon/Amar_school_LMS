'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { compressImage, IMAGE_PRESETS } from '@/lib/image/compress'
import {
  photoExtension,
  nextRollNumber,
  nextRollNumberForOffering,
  type RollRow,
  type EnrollmentRollRow,
} from '@/lib/students'
import {
  classCatalogueOptions,
  findClassCatalogueId,
  resolveClassCatalogueSelection,
  type ClassCatalogueRow,
} from '@/lib/class-catalogue'
import { admitStudent, studentPhotoUploadTicket, recordStudentPhoto } from '../actions'
import { dateInputClass, selectClass } from '@/components/ui/field'
import { uploadWithSignedToken } from '@/lib/storage/upload-client'
import { knownVocabularyValue } from '@/lib/students/stored-labels'

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

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
      <h3 className="mb-3 font-bold">{title}</h3>
      {children}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={fieldLabelClass}>{label}</label>
      {children}
    </div>
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
  const [classOfferingId, setClassOfferingId] = useState('')
  // The dropdown's own selection — an id purely to pick one option out of
  // the (possibly ambiguous by name+section alone) catalogue; resolved
  // immediately back to the className/section this mode actually submits.
  // Initialized from the edit form's existing text pair via
  // findClassCatalogueId so an in-progress edit still shows the right
  // option selected, even though `defaults` never carried an id.
  const [editComboId, setEditComboId] = useState(() => findClassCatalogueId(classCatalogue, d('class_name'), d('section')))
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
      <Card title={t('students.identity', lang)}>
        <div className="grid gap-grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <Field label={t('students.name', lang)}>
            <input name="full_name" required defaultValue={d('full_name')} className={fieldClass} />
          </Field>
          <Field label={t('students.dob', lang)}>
            <input type="date" name="date_of_birth" defaultValue={d('date_of_birth')} className={dateInputClass({ size: 'md', fullWidth: true })} />
          </Field>
          <Field label={t('students.gender', lang)}>
            <select name="gender" defaultValue={d('gender')} className={selectClass({ size: 'md', fullWidth: true })}>
              <option value="">—</option>
              <option value="male">{t('students.male', lang)}</option>
              <option value="female">{t('students.female', lang)}</option>
              <option value="third_gender">{t('students.thirdGender', lang)}</option>
            </select>
          </Field>
          <Field label={t('students.bloodGroup', lang)}>
            <select name="blood_group" defaultValue={d('blood_group')} className={selectClass({ size: 'md', fullWidth: true })}>
              <option value="">—</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </Field>
          {usingOfferings ? (
            <Field label={t('students.class', lang)}>
              {/* Admission mode (map #568/#582, #586): one id-based select —
                  the Class Offering already carries its own section, so
                  there's no second cascade step. Submits class_offering_id,
                  read by admitStudent and passed straight into
                  admit_student_enrollment; class_name/section are no longer
                  part of this form's submission. */}
              <select
                name="class_offering_id"
                value={classOfferingId}
                onChange={(e) => setClassOfferingId(e.target.value)}
                className={selectClass({ size: 'md', fullWidth: true })}
              >
                <option value="">—</option>
                {offeringOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label={t('students.class', lang)}>
              {/* Edit mode (grilled explicitly, option A): one Class
                  Catalogue-labelled select, same shape as every other
                  Offering picker in the app. Its own value is an id, purely
                  to disambiguate the option list — never submitted. Picking
                  one resolves straight to the className/section hidden
                  inputs below, so updateStudent's payload is byte-identical
                  in shape to the two-select cascade this replaced. */}
              <select
                value={editComboId}
                onChange={(e) => {
                  const id = e.target.value
                  setEditComboId(id)
                  const resolved = resolveClassCatalogueSelection(classCatalogue, id)
                  setClassName(resolved.className)
                  setSection(resolved.section)
                }}
                className={selectClass({ size: 'md', fullWidth: true })}
              >
                <option value="">—</option>
                {classCatalogue.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
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
                reattaching the old roll to a new class+section. The
                suggestion itself is a *placeholder*, not a prefilled value:
                left blank, the field submits null and the appropriate
                advisory-locked max()+increment trigger (assign_student_roll
                in text mode, assign_enrollment_roll in offering mode) safely
                serializes concurrent admissions — submitting the guessed
                number as a real value would instead race two simultaneous
                admissions for the same roll. */}
            <input
              key={usingOfferings ? classOfferingId : JSON.stringify([className, section])}
              type="number"
              name="roll_number"
              min={1}
              defaultValue={
                !usingOfferings && className === d('class_name') && section === d('section') ? d('roll_number') : ''
              }
              placeholder={suggestedRoll !== null ? String(suggestedRoll) : undefined}
              className={fieldClass}
            />
            {suggestRoll && <p className="mt-1 text-xs text-muted">{t('students.rollAutoNote', lang)}</p>}
          </Field>
          <Field label={t('students.religion', lang)}>
            <select
              value={religion.choice}
              onChange={(e) => setReligion({ choice: e.target.value, other: religion.other })}
              className={selectClass({ size: 'md', fullWidth: true })}
            >
              <option value="">—</option>
              <option value="islam">{t('students.islam', lang)}</option>
              <option value="hinduism">{t('students.hinduism', lang)}</option>
              <option value="christianity">{t('students.christianity', lang)}</option>
              <option value="buddhism">{t('students.buddhism', lang)}</option>
              <option value="other">{t('students.otherReligion', lang)}</option>
            </select>
            {religion.choice === 'other' && (
              <input
                value={religion.other}
                onChange={(e) => setReligion({ choice: 'other', other: e.target.value })}
                placeholder={t('students.religionSpecify', lang)}
                className={`${fieldClass} mt-2`}
              />
            )}
            <input type="hidden" name="religion" value={religion.choice === 'other' ? religion.other : religion.choice} />
          </Field>
          <Field label={t('students.studentMobile', lang)}>
            <input name="student_mobile" defaultValue={d('student_mobile')} className={fieldClass} placeholder="01xxxxxxxxx" />
          </Field>
          {/* Data-model prep for future attendance-machine sync (issue #564)
              gets its UI here (#565) — plain text (not number: leading zeros
              are possible and meaningful), no format constraint, matching
              the DB. Separate from the Attendance module's own card
              assignment (card-controls.tsx / rfid_cards) — the hint says so. */}
          <Field label={t('students.rfidCardNumber', lang)}>
            <input
              name="rfid_card_number"
              defaultValue={d('rfid_card_number')}
              className={`${fieldClass} font-mono`}
            />
            <p className="mt-1 text-xs text-muted">{t('students.rfidCardNumberHint', lang)}</p>
          </Field>
        </div>
      </Card>

      <Card title={t('students.address', lang)}>
        <div className="grid gap-grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <Field label={t('students.village', lang)}>
            <input name="village" defaultValue={d('village')} className={fieldClass} />
          </Field>
          <Field label={t('students.union', lang)}>
            <input name="union_name" defaultValue={d('union_name')} className={fieldClass} />
          </Field>
          <Field label={t('students.upazila', lang)}>
            <input name="upazila" defaultValue={d('upazila')} className={fieldClass} />
          </Field>
          <Field label={t('students.district', lang)}>
            <input name="district" defaultValue={d('district')} className={fieldClass} />
          </Field>
        </div>
      </Card>

      <Card title={t('students.guardianInfo', lang)}>
        <div className="grid gap-grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <Field label={t('students.guardianName', lang)}>
            <input name="guardian_name" defaultValue={d('guardian_name')} className={fieldClass} />
          </Field>
          <Field label={t('students.relation', lang)}>
            <select name="guardian_relation" defaultValue={d('guardian_relation')} className={selectClass({ size: 'md', fullWidth: true })}>
              <option value="">—</option>
              <option value="father">{t('students.father', lang)}</option>
              <option value="mother">{t('students.mother', lang)}</option>
              <option value="other">{t('students.otherRelation', lang)}</option>
            </select>
          </Field>
          <Field label={t('students.guardianMobile', lang)}>
            <input name="guardian_mobile" defaultValue={d('guardian_mobile')} className={fieldClass} placeholder="01xxxxxxxxx" />
          </Field>
          <Field label={t('students.guardianNid', lang)}>
            <input name="guardian_nid" defaultValue={d('guardian_nid')} className={fieldClass} />
          </Field>
        </div>
      </Card>

      <Card title={t('students.benefitFlags', lang)}>
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
export async function uploadStudentPhoto(
  studentId: string,
  file: File,
  lang: Lang,
): Promise<string | null> {
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

export function AdmissionForm({
  lang,
  classOfferings,
  enrollmentRolls = [],
  rollIncrement = 1,
  showYear = false,
}: {
  lang: Lang
  classOfferings: ClassCatalogueRow[]
  enrollmentRolls?: EnrollmentRollRow[]
  rollIncrement?: number
  showYear?: boolean
}) {
  const router = useRouter()
  const photoRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
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
          // that creates a duplicate, so this is surfaced the same way a photo
          // failure below is, and the profile we navigate to shows the truth.
          if (result.error) console.warn('admission warning:', result.error)
          const photo = photoRef.current?.files?.[0]
          if (photo) {
            const photoError = await uploadStudentPhoto(result.id, photo, lang)
            // The admission itself succeeded; a photo problem shouldn't strand
            // the user on the form — it can be re-uploaded from the profile.
            if (photoError) console.warn('photo upload failed:', photoError)
          }
          router.push(`/school/students/${result.id}`)
        })
      }}
    >
      <ProfileFields
        lang={lang}
        classOfferings={classOfferings}
        enrollmentRolls={enrollmentRolls}
        rollIncrement={rollIncrement}
        suggestRoll
        showYear={showYear}
      />

      <Card title={t('students.photo', lang)}>
        <Field label={t('students.uploadPhoto', lang)}>
          <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className={fieldClass} />
        </Field>
        <p className="mt-1 text-xs text-muted">{t('students.photoHint', lang)}</p>
      </Card>

      {error && <p className="mb-3 text-sm text-alert-deep">{error}</p>}

      <div className="flex items-center justify-between">
        <Link
          href="/school/students"
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
    </form>
  )
}
