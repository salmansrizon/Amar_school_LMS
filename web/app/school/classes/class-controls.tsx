'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { addClass, addSubject, removeItem, setClassTeacher } from './actions'
import { selectClass } from '@/components/ui/field'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { classCatalogueLabel, type ClassCatalogueRow } from '@/lib/class-catalogue'

function useSubmit(action: (data: FormData) => Promise<{ error?: string }>) {
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
      else form.reset()
    })
  }
  return { error, pending, onSubmit }
}

export interface TeacherOption {
  id: string
  full_name: string
}

export function AddClassForm({ lang, teachers }: { lang: Lang; teachers: TeacherOption[] }) {
  const { error, pending, onSubmit } = useSubmit(addClass)
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
      <div>
        <label className={labelClass} htmlFor="class_level">{t('classes.educationLevel', lang)}</label>
        <input id="class_level" name="education_level" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="class_group">{t('classes.groupDept', lang)}</label>
        <input id="class_group" name="group_department" className={inputClass} />
      </div>
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

/** Inline Class Teacher assignment on a class row. There is no class edit form,
 *  and this is also the backfill path for classes that predate #443. */
export function ClassTeacherPicker({
  lang,
  classId,
  teachers,
  current,
}: {
  lang: Lang
  classId: string
  teachers: TeacherOption[]
  current: string | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      <select
        aria-label={t('classes.classTeacher', lang)}
        defaultValue={current ?? ''}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value || null
          startTransition(async () => {
            setError(null)
            const result = await setClassTeacher(classId, value)
            if (result.error) setError(result.error)
          })
        }}
        className={selectClass()}
      >
        <option value="">{t('classes.classTeacherNone', lang)}</option>
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.full_name}
          </option>
        ))}
      </select>
      {!current && !error && (
        <span className="ml-2 rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">
          {t('classes.classTeacherMissing', lang)}
        </span>
      )}
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}

export function AddSubjectForm({
  lang,
  classes,
}: {
  lang: Lang
  classes: ClassCatalogueRow[]
}) {
  const { error, pending, onSubmit } = useSubmit(addSubject)
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={onSubmit}>
      <div>
        <label className={labelClass} htmlFor="subject_class">{t('classes.class', lang)}</label>
        <select id="subject_class" name="class_id" required className={selectClass({ size: 'md', fullWidth: true })} defaultValue="">
          <option value="" disabled>
            {t('classes.selectClass', lang)}
          </option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {classCatalogueLabel(c)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="subject_name">{t('classes.name', lang)}</label>
        <input id="subject_name" name="name" required className={inputClass} />
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
  entity: 'classes' | 'subjects'
  id: string
  lang: Lang
}) {
  // Deleting a class cascades to its subjects — say so in the in-app dialog (#365).
  const key = entity === 'classes' ? 'classes.deleteConfirm' : 'classes.deleteConfirmSimple'
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
