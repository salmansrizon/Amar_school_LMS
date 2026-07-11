'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { createEmployee } from '../actions'

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

/** Shared profile-section fields (Identity/Bank/Category/Subject/Grace) —
 *  reused by the edit form on the detail page. */
export function ProfileFields({
  lang,
  defaults = {},
}: {
  lang: Lang
  defaults?: Record<string, string | number | null>
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
            <input type="date" name="date_of_birth" defaultValue={d('date_of_birth')} className={fieldClass} />
          </Field>
          <Field label={t('employees.joiningDate', lang)}>
            <input type="date" name="joining_date" defaultValue={d('joining_date')} className={fieldClass} />
          </Field>
        </div>
      </Card>

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
            <input
              name="category"
              defaultValue={d('category')}
              className={fieldClass}
              list="employee-categories"
            />
            <datalist id="employee-categories">
              <option value={t('employees.categoryTeacher', lang)} />
              <option value={t('employees.categoryOfficeStaff', lang)} />
              <option value={t('employees.categorySecurity', lang)} />
            </datalist>
          </Field>
          <Field label={t('employees.qualification', lang)}>
            <input name="qualification" defaultValue={d('qualification')} className={fieldClass} />
          </Field>
          <Field label={t('employees.department', lang)}>
            <input name="department" defaultValue={d('department')} className={fieldClass} />
          </Field>
        </div>
      </Card>

      <Card title={t('employees.subjectShift', lang)}>
        <Field label={t('employees.subjectTaught', lang)}>
          <input name="subject_taught" defaultValue={d('subject_taught')} className={fieldClass} />
        </Field>
        <p className="mt-2 text-xs text-muted">{t('employees.shiftAssignHint', lang)}</p>
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

export function CreateEmployeeForm({ lang }: { lang: Lang }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          setError(null)
          const result = await createEmployee(data)
          if (result.error || !result.id) {
            setError(result.error ?? 'Save failed')
            return
          }
          router.push(`/school/employees/${result.id}`)
        })
      }}
    >
      <ProfileFields lang={lang} />

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
