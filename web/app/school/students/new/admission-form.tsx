'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { compressImage, IMAGE_PRESETS } from '@/lib/image/compress'
import {
  photoExtension,
  sectionsForClass,
  classNamesFor,
  nextRollNumber,
  type ClassNameSectionRow,
  type RollRow,
} from '@/lib/students'
import { admitStudent, studentPhotoUploadTicket, recordStudentPhoto } from '../actions'
import { dateInputClass, selectClass } from '@/components/ui/field'
import { uploadWithSignedToken } from '@/lib/storage/upload-client'

const MAX_PHOTO_BYTES = 2 * 1024 * 1024 // mirrors the bucket's server-enforced cap

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
 *  Previous/Sibling) — reused by the edit form on the detail page. */
export function ProfileFields({
  lang,
  classes,
  defaults = {},
  rolls = [],
  rollIncrement = 1,
  suggestRoll = false,
}: {
  lang: Lang
  classes: ClassNameSectionRow[]
  defaults?: Record<string, string | boolean | number | null>
  /** Existing rolls (issue #503), used only to prefill a *new* admission's Roll
   *  Number field — the edit form already has a real roll in `defaults`. */
  rolls?: RollRow[]
  rollIncrement?: number
  /** Only the admission form opts in — an edit-mode student's roll_number can
   *  legitimately be null (e.g. right after a section-only transfer), and
   *  `rolls`/`rollIncrement` are never fetched for that call site, so a
   *  suggestion computed there would be a meaningless "1" every time. */
  suggestRoll?: boolean
}) {
  const d = (key: string) => String(defaults[key] ?? '')
  const classNames = classNamesFor(classes)
  const [className, setClassName] = useState(d('class_name'))
  const [section, setSection] = useState(d('section'))
  const sections = useMemo(() => sectionsForClass(classes, className), [classes, className])
  // Only className is required — an empty section is itself a valid scope
  // (a class with no sections at all, e.g. most Primary classes per
  // docs/012): nextRollNumber and assign_student_roll both treat "no
  // section" as a stable group, not as "nothing selected yet".
  const suggestedRoll = useMemo(
    () => (suggestRoll && className ? nextRollNumber(rolls, className, section, rollIncrement) : null),
    [suggestRoll, rolls, className, section, rollIncrement],
  )

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
            </select>
          </Field>
          <Field label={t('students.bloodGroup', lang)}>
            <input name="blood_group" defaultValue={d('blood_group')} className={fieldClass} placeholder="A+" />
          </Field>
          <Field label={t('students.class', lang)}>
            <select
              name="class_name"
              value={className}
              onChange={(e) => {
                setClassName(e.target.value)
                // A section from the old class won't be in the new class's
                // options — clear it rather than leave stale state behind
                // (the <select> below is now controlled, so it can no longer
                // rely on the key-remount trick to reset itself).
                setSection('')
              }}
              className={selectClass({ size: 'md', fullWidth: true })}
            >
              <option value="">—</option>
              {classNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('students.section', lang)}>
            {/* Controlled — the class select's onChange clears this state
                directly so a stale section can't linger past a class change. */}
            <select
              name="section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className={selectClass({ size: 'md', fullWidth: true })}
            >
              <option value="">—</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('students.roll', lang)}>
            {/* key remounts on class/section change so a manual entry made for
                the old class+section can't linger. In edit mode, d('roll_number')
                is the *original* student record — it only stays the default
                once className/section have moved away from that original
                class+section (a genuine scope change), so a class edit forces
                a conscious re-entry instead of silently reattaching the old
                roll to a new class+section. The suggestion itself is a
                *placeholder*, not a prefilled value: left blank, the field
                submits null and assign_student_roll's advisory-locked
                max()+increment safely serializes concurrent admissions —
                submitting the guessed number as a real value would instead
                race two simultaneous admissions for the same roll. */}
            <input
              key={JSON.stringify([className, section])}
              type="number"
              name="roll_number"
              min={1}
              defaultValue={className === d('class_name') && section === d('section') ? d('roll_number') : ''}
              placeholder={suggestedRoll !== null ? String(suggestedRoll) : undefined}
              className={fieldClass}
            />
            {suggestRoll && <p className="mt-1 text-xs text-muted">{t('students.rollAutoNote', lang)}</p>}
          </Field>
          <Field label={t('students.religion', lang)}>
            <input name="religion" defaultValue={d('religion')} className={fieldClass} />
          </Field>
          <Field label={t('students.studentMobile', lang)}>
            <input name="student_mobile" defaultValue={d('student_mobile')} className={fieldClass} placeholder="01xxxxxxxxx" />
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
  classes,
  rolls = [],
  rollIncrement = 1,
}: {
  lang: Lang
  classes: ClassNameSectionRow[]
  rolls?: RollRow[]
  rollIncrement?: number
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
          if (result.error || !result.id) {
            setError(result.error ?? 'Save failed')
            return
          }
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
      <ProfileFields lang={lang} classes={classes} rolls={rolls} rollIncrement={rollIncrement} suggestRoll />

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
