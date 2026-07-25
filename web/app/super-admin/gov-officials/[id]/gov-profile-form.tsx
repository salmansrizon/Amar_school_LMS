'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { EDUCATION_LEVELS, EDUCATION_LEVEL_KEY } from '@/lib/super-admin/gov'
import { updateGovProfile } from '../actions'

// Edit a Government Official's designation + education-level scope (#164).
export function GovProfileForm({
  profileId,
  designation,
  scope,
  lang,
}: {
  profileId: string
  designation: string | null
  scope: string[]
  lang: Lang
}) {
  const router = useRouter()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          setError(null)
          setNote(null)
          const result = await updateGovProfile(profileId, data)
          if (result.error) setError(result.error)
          else {
            setNote(t('sa.gov.saved', lang))
            router.refresh()
          }
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="designation">{t('sa.gov.designation', lang)}</label>
        <input
          id="designation"
          name="designation"
          defaultValue={designation ?? ''}
          placeholder={t('sa.gov.designationPlaceholder', lang)}
          className={inputClass}
        />
      </div>

      <fieldset>
        <legend className={labelClass}>{t('sa.gov.eduScope', lang)}</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {EDUCATION_LEVELS.map((level) => (
            <label key={level} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="education_level_scope"
                value={level}
                defaultChecked={scope.includes(level)}
                className="size-4 accent-brand-600"
              />
              {t(EDUCATION_LEVEL_KEY[level], lang)}
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" disabled={pending} className={primaryBtnClass}>
        {t('sa.gov.save', lang)}
      </button>
      {note && <p className="text-sm text-mint-deep">{note}</p>}
      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </form>
  )
}
