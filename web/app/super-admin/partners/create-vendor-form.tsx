'use client'

import { useState } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { createVendorUser } from './actions'

export function CreateVendorForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setBusy(true)
    setError(null)
    const result = await createVendorUser(new FormData(form))
    setBusy(false)
    if (result.error) setError(result.error)
    else form.reset()
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor="v_full_name">{t('staff.fullName', lang)}</label>
        <input id="v_full_name" name="full_name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="v_role">{t('partners.role', lang)}</label>
        <select id="v_role" name="role" required className={inputClass}>
          <option value="dealer">{t('partners.dealer', lang)}</option>
          <option value="gov_official">{t('partners.gov', lang)}</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="v_email">{t('login.email', lang)}</label>
        <input id="v_email" name="email" type="email" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="v_password">{t('login.password', lang)}</label>
        <input id="v_password" name="password" type="password" minLength={8} required className={inputClass} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      <button type="submit" disabled={busy} className={`${primaryBtnClass} sm:col-span-2`}>
        {t('partners.create', lang)}
      </button>
    </form>
  )
}
