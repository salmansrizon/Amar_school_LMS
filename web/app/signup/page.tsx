'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AuthCard, inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { postLoginDestination } from '@/lib/auth/post-login'
import { t } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const lang = useLang()
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const form = new FormData(e.currentTarget)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email: String(form.get('email')),
      password: String(form.get('password')),
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
        data: { school_name: String(form.get('school_name')) },
      },
    })
    if (error) {
      setMessage(error.message)
      setBusy(false)
      return
    }
    if (data.session) {
      // Email confirmation disabled — session is live; register and go.
      router.replace(await postLoginDestination(supabase))
      return
    }
    setMessage(t('reset.sent', lang))
    setBusy(false)
  }

  return (
    <AuthCard lang={lang} title={t('signup.title', lang)}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className={labelClass} htmlFor="school_name">{t('signup.schoolName', lang)}</label>
          <input id="school_name" name="school_name" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="email">{t('login.email', lang)}</label>
          <input id="email" name="email" type="email" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="password">{t('login.password', lang)}</label>
          <input id="password" name="password" type="password" minLength={8} required className={inputClass} />
        </div>
        {message && <p className="text-sm text-muted">{message}</p>}
        <button type="submit" disabled={busy} className={primaryBtnClass}>
          {t('signup.submit', lang)}
        </button>
      </form>
      <div className="mt-4 text-sm">
        <Link href="/login" className="text-brand-600 hover:underline">
          {t('signup.haveAccount', lang)}
        </Link>
      </div>
    </AuthCard>
  )
}
