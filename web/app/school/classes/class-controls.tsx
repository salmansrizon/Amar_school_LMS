'use client'

import { useMemo, useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { addClass, addSubject, removeItem } from './actions'
import { selectClass } from '@/components/ui/field'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { classCatalogueLabel, type ClassCatalogueRow } from '@/lib/class-catalogue'
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

export function AddSubjectForm({
  lang,
  classes,
}: {
  lang: Lang
  classes: ClassCatalogueRow[]
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
              {classCatalogueLabel(c)}
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
