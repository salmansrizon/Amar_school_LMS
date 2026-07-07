'use client'

import { useState } from 'react'
import { AuthCard, inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const lang = useLang()
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    const form = new FormData(e.currentTarget)
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(String(form.get('email')), {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password/update`,
    })
    setSent(true)
    setBusy(false)
  }

  return (
    <AuthCard lang={lang} title={t('reset.title', lang)}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className={labelClass} htmlFor="email">{t('login.email', lang)}</label>
          <input id="email" name="email" type="email" required className={inputClass} />
        </div>
        {sent && <p className="text-sm text-mint-deep">{t('reset.sent', lang)}</p>}
        <button type="submit" disabled={busy} className={primaryBtnClass}>
          {t('reset.send', lang)}
        </button>
      </form>
    </AuthCard>
  )
}
