'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { createEmployee } from '../actions'
import { dateInputClass } from '@/components/ui/field'
import { reachSentences } from '@/lib/school/teacher-reach'
import { EMPLOYEE_CATEGORIES, isKnownEmployeeCategory } from '@/lib/employees'
import { ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'

const categoryLabelKey: Record<(typeof EMPLOYEE_CATEGORIES)[number], MessageKey> = {
  Teacher: 'employees.categoryTeacher',
  'Office Staff': 'employees.categoryOfficeStaff',
  Management: 'employees.categoryManagement',
  Security: 'employees.categorySecurity',
  'Head Teacher': 'employees.categoryHeadTeacher',
  Principal: 'employees.categoryPrincipal',
  'Vice Principal': 'employees.categoryVicePrincipal',
  Registrar: 'employees.categoryRegistrar',
  'Office Clerk': 'employees.categoryOfficeClerk',
  Accountant: 'employees.categoryAccountant',
  Professor: 'employees.categoryProfessor',
  Lecturer: 'employees.categoryLecturer',
  Librarian: 'employees.categoryLibrarian',
  Nurse: 'employees.categoryNurse',
  'Medical Staff': 'employees.categoryMedicalStaff',
  'IT Technician': 'employees.categoryItTechnician',
  Janitor: 'employees.categoryJanitor',
  Cleaner: 'employees.categoryCleaner',
  'Security Guard': 'employees.categorySecurityGuard',
  'Transport Staff': 'employees.categoryTransportStaff',
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

/** Shifts this new Employee works (issue #580, Wave 5/#590) — checkboxes,
 *  not the edit page's per-click-saving ShiftToggle pills: there is no
 *  employee_id yet to attach employee_academic_shifts rows to, so the
 *  selection rides along with the rest of the form's single submit
 *  (createEmployee applies it right after the employee row is inserted,
 *  the same deferred-until-id-exists pattern already used here for Class
 *  assignment). Absent entirely for a No-Shift School, same as everywhere
 *  else this vocabulary appears. */
function ShiftFields({ lang, shiftChoices }: { lang: Lang; shiftChoices: readonly AcademicShift[] }) {
  if (shiftChoices.length === 0) return null
  return (
    <Card title={t('employees.academicShifts', lang)}>
      <div className="flex flex-wrap gap-4">
        {shiftChoices.map((shift) => (
          <label key={shift} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shifts" value={shift} />
            {t(ACADEMIC_SHIFT_LABEL_KEY[shift], lang)}
          </label>
        ))}
      </div>
    </Card>
  )
}

/** Shared profile-section fields (Identity/Bank/Category/Subject/Grace) —
 *  reused by the edit form on the detail page. */
export function ProfileFields({
  lang,
  defaults = {},
  shiftChoices,
}: {
  lang: Lang
  defaults?: Record<string, string | number | null>
  /** Only passed by the create form (issue #580) — the edit page keeps its
   *  own separately-positioned ShiftToggle section instead. */
  shiftChoices?: readonly AcademicShift[]
}) {
  const d = (key: string) => String(defaults[key] ?? '')
  return (
    <>
      <Card title={t('employees.identity', lang)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('employees.name', lang)}>
            <input name="full_name" required defaultValue={d('full_name')} className={fieldClass} />
          </Field>
          <Field label={t('employees.mobile', lang)}>
            <input name="mobile" defaultValue={d('mobile')} className={fieldClass} placeholder="01xxxxxxxxx" />
          </Field>
          <Field label={t('employees.dob', lang)}>
            <input type="date" name="date_of_birth" defaultValue={d('date_of_birth')} className={dateInputClass({ size: 'md', fullWidth: true })} />
          </Field>
          <Field label={t('employees.joiningDate', lang)}>
            <input type="date" name="joining_date" defaultValue={d('joining_date')} className={dateInputClass({ size: 'md', fullWidth: true })} />
          </Field>
          {/* Data-model prep for future attendance-machine sync (issue #564)
              gets its UI here (#565) — plain text (not number: leading zeros
              are possible and meaningful), no format constraint, matching
              the DB. Separate from the Attendance module's own card
              assignment (card-controls.tsx / rfid_cards) — the hint says so. */}
          <Field label={t('employees.rfidCardNumber', lang)}>
            <input
              name="rfid_card_number"
              defaultValue={d('rfid_card_number')}
              className={`${fieldClass} font-mono`}
            />
            <p className="mt-1 text-xs text-muted">{t('employees.rfidCardNumberHint', lang)}</p>
          </Field>
        </div>
      </Card>

      {shiftChoices && <ShiftFields lang={lang} shiftChoices={shiftChoices} />}

      <Card title={t('employees.bankInfo', lang)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('employees.bankName', lang)}>
            <input name="bank_name" defaultValue={d('bank_name')} className={fieldClass} />
          </Field>
          <Field label={t('employees.bankBranch', lang)}>
            <input name="bank_branch" defaultValue={d('bank_branch')} className={fieldClass} />
          </Field>
          <Field label={t('employees.bankAccount', lang)}>
            <input name="bank_account" defaultValue={d('bank_account')} className={fieldClass} />
          </Field>
        </div>
      </Card>

      <Card title={t('employees.categoryQualification', lang)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('employees.category', lang)}>
            <select name="category" defaultValue={d('category')} className={fieldClass}>
              <option value="">{t('employees.categoryUnset', lang)}</option>
              {EMPLOYEE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(categoryLabelKey[c], lang)}
                </option>
              ))}
              {/* A category that predates the fixed list (issue #567) — the
                  seed data itself has "Head Teacher" — stays selectable and
                  selected, so opening the edit form doesn't blank or change
                  it just because it isn't one of the four. Never appears on
                  the create form: `defaults` is empty there. */}
              {d('category') && !isKnownEmployeeCategory(d('category')) && (
                <option value={d('category')}>
                  {d('category')} — {t('employees.categoryLegacy', lang)}
                </option>
              )}
            </select>
          </Field>
          <Field label={t('employees.qualification', lang)}>
            <input name="qualification" defaultValue={d('qualification')} className={fieldClass} />
          </Field>
          <Field label={t('employees.department', lang)}>
            <input name="department" defaultValue={d('department')} className={fieldClass} />
          </Field>
        </div>
      </Card>

      <Card title={t('employees.subjectOfficeTime', lang)}>
        <Field label={t('employees.subjectTaught', lang)}>
          <input name="subject_taught" defaultValue={d('subject_taught')} className={fieldClass} />
        </Field>
        <p className="mt-2 text-xs text-muted">{t('employees.officeTimeAssignHint', lang)}</p>
      </Card>

      <Card title={t('employees.graceOverrideTitle', lang)}>
        <p className="mb-3 text-sm text-muted">{t('grace.hint', lang)}</p>
        <Field label={t('employees.override', lang)}>
          <input
            name="grace_override"
            type="number"
            min={0}
            defaultValue={d('grace_override_minutes')}
            className={fieldClass}
            placeholder="e.g. 20"
          />
        </Field>
      </Card>
    </>
  )
}

export interface ClassOption {
  id: string
  label: string
  taken: boolean
}

/** Login + Class (issue #566): both optional, same submit — folds in what
 *  used to be the separate "Add a teacher" flow (#533). Lives here, not in
 *  the shared ProfileFields, because ProfileFields is also reused by the
 *  employee *edit* screen, which already has its own login-management UI
 *  (LoginLinkPicker, employee-controls.tsx) — a second one on the same
 *  screen would be confusing, not convenient. So these two sections are
 *  create-only. */
function LoginAndClassFields({
  lang,
  classes,
  classId,
  onClassChange,
}: {
  lang: Lang
  classes: ClassOption[]
  classId: string
  onClassChange: (id: string) => void
}) {
  return (
    <>
      <Card title={t('teacher.stepLogin', lang)}>
        <p className="mb-3 text-xs text-muted">{t('teacher.stepLoginHelp', lang)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('login.email', lang)}>
            <input id="email" name="email" type="email" className={fieldClass} autoComplete="off" />
          </Field>
          <Field label={t('login.password', lang)}>
            <input id="password" name="password" type="password" minLength={8} className={fieldClass} autoComplete="new-password" />
          </Field>
        </div>
      </Card>

      <Card title={t('teacher.stepClass', lang)}>
        <p className="mb-3 text-xs text-muted">{t('teacher.stepClassHelp', lang)}</p>
        <select
          name="class_id"
          value={classId}
          onChange={(e) => onClassChange(e.target.value)}
          className={fieldClass}
        >
          <option value="">{t('teacher.noClassYet', lang)}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.taken ? ` — ${t('teacher.classAlreadyHasTeacher', lang)}` : ''}
            </option>
          ))}
        </select>
      </Card>
    </>
  )
}

export function CreateEmployeeForm({
  lang,
  classes,
  shiftChoices = [],
}: {
  lang: Lang
  classes: ClassOption[]
  shiftChoices?: readonly AcademicShift[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [classId, setClassId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const chosen = classes.find((c) => c.id === classId) ?? null
  // Derived from the choice, not from a permissions screen: ADR 0021 makes a Class
  // Teacher's reach follow from the assignment itself, so the Owner can be shown
  // the consequence before confirming rather than after logging in as them.
  const preview = reachSentences({ classTeacherOf: chosen ? [chosen.label] : [], teaches: [] }, lang)

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          setError(null)
          const result = await createEmployee(data)
          // A partial failure (e.g. the employee record was made but the login
          // step failed) still reports the employee it made, so the Owner is
          // never told to start over on a record that already exists — the one
          // behavior from #533's old two-form design worth carrying forward.
          // The error rides along as a query param, not just component state:
          // router.push unmounts this form, so state alone would be silently
          // dropped and the Owner would land on the record with no explanation.
          if (result.error) {
            if (result.id) {
              router.push(`/school/employees/${result.id}?error=${encodeURIComponent(result.error)}`)
              return
            }
            setError(result.error)
            return
          }
          if (!result.id) {
            setError('Save failed')
            return
          }
          router.push(`/school/employees/${result.id}`)
        })
      }}
    >
      <ProfileFields lang={lang} shiftChoices={shiftChoices} />
      <LoginAndClassFields lang={lang} classes={classes} classId={classId} onClassChange={setClassId} />

      <Card title={t('teacher.previewTitle', lang)}>
        <ul className="grid gap-1 text-sm text-muted">
          {preview.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      {error && <p className="mb-3 text-sm text-alert-deep">{error}</p>}

      <div className="flex items-center justify-between">
        <Link
          href="/school/employees"
          className="rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted"
        >
          {t('routine.cancel', lang)}
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t('employees.saveEmployee', lang)}
        </button>
      </div>
    </form>
  )
}
