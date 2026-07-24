'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AuthCard, inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { createClient } from '@/lib/supabase/client'
import { validateSlug, normalizeSlug } from '@/lib/subdomain'
import { claimErrorKey } from '@/lib/claim'
import { homeFor, type Role } from '@/lib/auth/routing'
import { rootDomain } from '@/lib/auth/tenant-host'

type Phase = 'loading' | 'need-account' | 'confirm-email' | 'claim'

// Owner onboarding (issue #112): create an auth account (if needed), redeem the
// super-admin claim code, pick a subdomain, and land on the school's subdomain.
export default function ClaimPage() {
  const lang = useLang()
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setPhase('need-account')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile) {
        router.replace(homeFor(profile.role as Role))
        return
      }
      setPhase('claim')
    })
  }, [router])

  async function onCreateAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email: String(form.get('email')),
      password: String(form.get('password')),
      options: { emailRedirectTo: `${location.origin}/claim` },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setPhase(data.session ? 'claim' : 'confirm-email')
  }

  async function onClaim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const slugError = validateSlug(slug)
    if (slugError) {
      setError(t('claim.slugInvalid', lang))
      return
    }
    setBusy(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const supabase = createClient()
    const { error } = await supabase.rpc('redeem_school_claim_code', {
      code_text: String(form.get('code')).trim(),
      desired_subdomain: normalizeSlug(slug),
    })
    if (error) {
      setError(t(claimErrorKey(error.message), lang))
      setBusy(false)
      return
    }
    // Land on the school's own subdomain (the session now carries a profile).
    setSuccess(true)
    window.location.href = `${location.protocol}//${normalizeSlug(slug)}.${rootDomain()}/school`
  }

  if (phase === 'loading') {
    return <AuthCard lang={lang} title={t('claim.title', lang)}><p className="text-sm text-muted">…</p></AuthCard>
  }

  if (phase === 'confirm-email') {
    return (
      <AuthCard lang={lang} title={t('claim.title', lang)}>
        <p className="text-sm text-muted">{t('claim.checkEmail', lang)}</p>
      </AuthCard>
    )
  }

  if (phase === 'need-account') {
    return (
      <AuthCard lang={lang} title={t('claim.title', lang)}>
        <p className="mb-3 text-sm text-muted">{t('claim.intro', lang)}</p>
        <form onSubmit={onCreateAccount} className="flex flex-col gap-3">
          <div>
            <label className={labelClass} htmlFor="email">{t('login.email', lang)}</label>
            <input id="email" name="email" type="email" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="password">{t('login.password', lang)}</label>
            <input id="password" name="password" type="password" minLength={8} required className={inputClass} />
          </div>
          {error && <p className="text-sm text-alert-deep">{error}</p>}
          <button type="submit" disabled={busy} className={primaryBtnClass}>
            {t('claim.createAccount', lang)}
          </button>
        </form>
        <div className="mt-4 text-sm">
          <Link href="/login" className="text-brand-600 hover:underline">{t('claim.haveAccount', lang)}</Link>
        </div>
      </AuthCard>
    )
  }

  // phase === 'claim'
  const slugError = slug.trim() ? validateSlug(slug) : null
  return (
    <AuthCard lang={lang} title={t('claim.title', lang)}>
      <p className="mb-3 text-sm text-muted">{t('claim.intro', lang)}</p>
      <form onSubmit={onClaim} className="flex flex-col gap-3">
        <div>
          <label className={labelClass} htmlFor="code">{t('claim.code', lang)}</label>
          <input id="code" name="code" required className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label className={labelClass} htmlFor="subdomain">{t('claim.subdomain', lang)}</label>
          <input
            id="subdomain"
            name="subdomain"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={`${inputClass} font-mono`}
          />
          <p className={`mt-1 text-xs ${slugError ? 'text-alert-deep' : 'text-muted'}`}>
            {slugError ? t('claim.slugInvalid', lang) : t('claim.subdomainHint', lang)}
          </p>
        </div>
        {error && <p className="text-sm text-alert-deep">{error}</p>}
        {success && <p className="text-sm text-mint-deep">{t('claim.success', lang)}</p>}
        <button type="submit" disabled={busy || slugError !== null} className={primaryBtnClass}>
          {t('claim.submit', lang)}
        </button>
      </form>
    </AuthCard>
  )
}
