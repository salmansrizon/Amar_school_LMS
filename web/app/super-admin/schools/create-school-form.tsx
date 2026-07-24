'use client'

import { useState } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { createSchool } from './actions'

// Create a school + mint its first owner-claim code (issue #111). The code is
// shown once for the super-admin to hand to the owner.
export function CreateSchoolForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setBusy(true)
    setError(null)
    setCode(null)
    const result = await createSchool(new FormData(form))
    setBusy(false)
    if (result.error) setError(result.error)
    else {
      setCode(result.code ?? null)
      form.reset()
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="cs_name">{t('schools.name', lang)}</label>
        <input id="cs_name" name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="cs_mobile">{t('schools.mobile', lang)}</label>
        <input id="cs_mobile" name="mobile" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="cs_email">{t('login.email', lang)}</label>
        <input id="cs_email" name="email" type="email" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="cs_eiin">{t('schools.eiin', lang)}</label>
        <input id="cs_eiin" name="eiin_no" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="cs_address">{t('schools.address', lang)}</label>
        <input id="cs_address" name="address_line" className={inputClass} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      {code && (
        <div className="rounded-sm border border-mint-deep bg-mint-soft p-3 text-sm sm:col-span-2">
          <p className="font-semibold text-mint-deep">{t('schools.created', lang)}</p>
          <p className="mt-1 font-mono text-base">{code}</p>
          <p className="mt-1 text-xs text-muted">{t('schools.claimCodeHint', lang)}</p>
        </div>
      )}
      <button type="submit" disabled={busy} className={`${primaryBtnClass} sm:col-span-2`}>
        {t('schools.create', lang)}
      </button>
    </form>
  )
}
