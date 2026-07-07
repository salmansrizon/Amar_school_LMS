'use client'

import { useState } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { createStaff } from './actions'

export function CreateStaffForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setBusy(true)
    setError(null)
    const result = await createStaff(new FormData(form))
    setBusy(false)
    if (result.error) setError(result.error)
    else form.reset()
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor="full_name">{t('staff.fullName', lang)}</label>
        <input id="full_name" name="full_name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="email">{t('login.email', lang)}</label>
        <input id="email" name="email" type="email" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="password">{t('login.password', lang)}</label>
        <input id="password" name="password" type="password" minLength={8} required className={inputClass} />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={busy} className={primaryBtnClass}>
          {t('staff.createBtn', lang)}
        </button>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
    </form>
  )
}
