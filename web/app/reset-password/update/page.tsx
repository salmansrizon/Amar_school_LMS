'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AuthCard, inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { updatePassword } from '@/lib/auth/session-actions'

export default function UpdatePasswordPage() {
  const lang = useLang()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const { destination, error } = await updatePassword(String(form.get('password')))
    if (error || !destination) {
      setError(error ?? 'error')
      setBusy(false)
      return
    }
    router.replace(destination)
  }

  return (
    <AuthCard lang={lang} title={t('reset.newPassword', lang)}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className={labelClass} htmlFor="password">{t('reset.newPassword', lang)}</label>
          <input id="password" name="password" type="password" minLength={8} required className={inputClass} />
        </div>
        {error && <p className="text-sm text-alert-deep">{error}</p>}
        <button type="submit" disabled={busy} className={primaryBtnClass}>
          {t('reset.save', lang)}
        </button>
      </form>
    </AuthCard>
  )
}
