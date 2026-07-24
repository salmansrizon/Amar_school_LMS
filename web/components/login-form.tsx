'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AuthCard, inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { postLoginDestination } from '@/lib/auth/post-login'
import { t } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { createClient } from '@/lib/supabase/client'
import type { SchoolBrand } from '@/lib/school-branding'

// Login form. On a tenant subdomain it renders inside the school's branded
// card (issue #110); on the apex it falls back to the generic Eduwave card.
export function LoginForm({ brand }: { brand: SchoolBrand | null }) {
  const lang = useLang()
  const router = useRouter()
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(false)
    const form = new FormData(e.currentTarget)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })
    if (error) {
      setError(true)
      setBusy(false)
      return
    }
    router.replace(await postLoginDestination(supabase))
  }

  return (
    <AuthCard lang={lang} title={brand ? brand.name : t('login.title', lang)} brand={brand}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className={labelClass} htmlFor="email">{t('login.email', lang)}</label>
          <input id="email" name="email" type="email" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="password">{t('login.password', lang)}</label>
          <input id="password" name="password" type="password" required className={inputClass} />
        </div>
        {error && <p className="text-sm text-alert-deep">{t('login.failed', lang)}</p>}
        <button type="submit" disabled={busy} className={primaryBtnClass}>
          {t('login.submit', lang)}
        </button>
      </form>
      <div className="mt-4 flex flex-col gap-1 text-sm">
        <Link href="/reset-password" className="text-brand-600 hover:underline">
          {t('login.forgot', lang)}
        </Link>
      </div>
    </AuthCard>
  )
}
