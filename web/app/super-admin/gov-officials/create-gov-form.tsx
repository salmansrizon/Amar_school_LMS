'use client'

import { useState } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { createGovOfficial } from './actions'

// Create a Government Official account (role fixed — no role picker, unlike the
// shared vendor form). Designation + education scope are set on the detail page.
export function CreateGovForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setBusy(true)
    setError(null)
    const result = await createGovOfficial(new FormData(form))
    setBusy(false)
    if (result.error) setError(result.error)
    else form.reset()
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor="g_full_name">{t('staff.fullName', lang)}</label>
        <input id="g_full_name" name="full_name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="g_email">{t('login.email', lang)}</label>
        <input id="g_email" name="email" type="email" required className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="g_password">{t('login.password', lang)}</label>
        <input id="g_password" name="password" type="password" minLength={8} required className={inputClass} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      <button type="submit" disabled={busy} className={`${primaryBtnClass} sm:col-span-2`}>
        {t('sa.gov.create', lang)}
      </button>
    </form>
  )
}
