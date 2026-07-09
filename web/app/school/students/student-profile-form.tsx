'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { BLOOD_GROUPS, GENDERS, GUARDIAN_RELATIONS, type StudentProfile } from '@/lib/students'
import { admitStudent, updateStudent } from './actions'

export interface ShiftOption {
  id: string
  name: string
}

type Initial = Partial<StudentProfile> & { full_name?: string }

function Text({
  name,
  label,
  defaultValue,
  type = 'text',
  required,
}: {
  name: string
  label: string
  defaultValue?: string | null
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={defaultValue ?? ''} required={required} className={inputClass} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-line p-4">
      <legend className="px-1 text-sm font-bold">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

export function StudentProfileForm({
  mode,
  studentId,
  initial = {},
  shifts,
  lang,
}: {
  mode: 'create' | 'edit'
  studentId?: string
  initial?: Initial
  shifts: ShiftOption[]
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          setError(null)
          if (mode === 'create') {
            const res = await admitStudent(data)
            if (res.error) setError(res.error)
            else router.push(`/school/students/${res.id}`)
          } else {
            const res = await updateStudent(studentId!, data)
            if (res.error) setError(res.error)
            else router.push(`/school/students/${studentId}`)
          }
        })
      }}
    >
      <Section title={t('students.secIdentity', lang)}>
        <Text name="full_name" label={t('students.name', lang)} defaultValue={initial.full_name} required />
        <div>
          <label className={labelClass} htmlFor="gender">{t('students.gender', lang)}</label>
          <select id="gender" name="gender" defaultValue={initial.gender ?? ''} className={inputClass}>
            <option value="">—</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>{g[lang]}</option>
            ))}
          </select>
        </div>
        <Text name="date_of_birth" label={t('students.dob', lang)} type="date" defaultValue={initial.date_of_birth} />
        <div>
          <label className={labelClass} htmlFor="blood_group">{t('students.blood', lang)}</label>
          <select id="blood_group" name="blood_group" defaultValue={initial.blood_group ?? ''} className={inputClass}>
            <option value="">—</option>
            {BLOOD_GROUPS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <Text name="religion" label={t('students.religion', lang)} defaultValue={initial.religion} />
        <Text name="student_mobile" label={t('students.mobile', lang)} defaultValue={initial.student_mobile} />
      </Section>

      <Section title={t('students.secPlacement', lang)}>
        <Text name="class_name" label={t('students.class', lang)} defaultValue={initial.class_name} />
        <Text name="section" label={t('students.section', lang)} defaultValue={initial.section} />
        <div>
          <label className={labelClass} htmlFor="shift_id">{t('students.shift', lang)}</label>
          <select id="shift_id" name="shift_id" defaultValue={initial.shift_id ?? ''} className={inputClass}>
            <option value="">—</option>
            {shifts.map((sh) => (
              <option key={sh.id} value={sh.id}>{sh.name}</option>
            ))}
          </select>
        </div>
      </Section>

      <Section title={t('students.secAddress', lang)}>
        <Text name="village" label={t('students.village', lang)} defaultValue={initial.village} />
        <Text name="union_name" label={t('students.union', lang)} defaultValue={initial.union_name} />
        <Text name="upazila" label={t('students.upazila', lang)} defaultValue={initial.upazila} />
        <Text name="district" label={t('students.district', lang)} defaultValue={initial.district} />
      </Section>

      <Section title={t('students.secGuardian', lang)}>
        <Text name="guardian_name" label={t('students.guardianName', lang)} defaultValue={initial.guardian_name} />
        <div>
          <label className={labelClass} htmlFor="guardian_relation">{t('students.guardianRelation', lang)}</label>
          <select id="guardian_relation" name="guardian_relation" defaultValue={initial.guardian_relation ?? ''} className={inputClass}>
            <option value="">—</option>
            {GUARDIAN_RELATIONS.map((r) => (
              <option key={r.value} value={r.value}>{r[lang]}</option>
            ))}
          </select>
        </div>
        <Text name="guardian_mobile" label={t('students.guardianMobile', lang)} defaultValue={initial.guardian_mobile} />
        <Text name="guardian_nid" label={t('students.guardianNid', lang)} defaultValue={initial.guardian_nid} />
      </Section>

      <Section title={t('students.secOther', lang)}>
        <Text name="previous_institute" label={t('students.prevInstitute', lang)} defaultValue={initial.previous_institute} />
        <Text name="previous_class" label={t('students.prevClass', lang)} defaultValue={initial.previous_class} />
        <Text name="sibling_info" label={t('students.siblings', lang)} defaultValue={initial.sibling_info} />
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_freedom_fighter_child" defaultChecked={initial.is_freedom_fighter_child} />
            {t('students.freedomFighter', lang)}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_indigenous" defaultChecked={initial.is_indigenous} />
            {t('students.indigenous', lang)}
          </label>
        </div>
      </Section>

      {error && <p className="text-sm text-alert-deep">{error}</p>}
      <button type="submit" disabled={pending} className={primaryBtnClass}>
        {mode === 'create' ? t('students.admit', lang) : t('common.save', lang)}
      </button>
    </form>
  )
}
