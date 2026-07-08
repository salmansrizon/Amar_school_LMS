import { redirect } from 'next/navigation'
import { LangSwitch } from '@/components/lang-switch'
import { LogoutButton } from '@/components/logout-button'
import { currentLang } from '@/lib/i18n-server'
import { canAccess, homeFor, type Role } from '@/lib/auth/routing'
import { t, type MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

// Bare authenticated landing shell per role (issue #1 — no feature UI yet).
// Re-verifies the session server-side; the proxy check is only optimistic.
export async function RoleShell({
  group,
  titleKey,
  ownerLinks = [],
  links = [],
  children,
}: {
  group: string
  titleKey: MessageKey
  /** Quick links shown only to School Owners (e.g. staff management). */
  ownerLinks?: { href: string; labelKey: MessageKey }[]
  /** Quick links shown to every role in this group. */
  links?: { href: string; labelKey: MessageKey }[]
  /** Feature content; when present it replaces the placeholder text. */
  children?: React.ReactNode
}) {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')
  // Wrong role group: send them to their own home, not back to the login form.
  if (!canAccess(profile.role as Role, group)) redirect(homeFor(profile.role as Role))

  const allLinks = [...links, ...(profile.role === 'school_owner' ? ownerLinks : [])]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line bg-ink px-4 py-3 text-white">
        <div className="flex items-center gap-2 font-extrabold">
          <span className="flex size-7 items-center justify-center rounded-sm bg-brand-500 text-sm font-bold">
            A
          </span>
          {t('app.name', lang)}
        </div>
        <div className="flex items-center gap-3">
          <LangSwitch lang={lang} />
          <LogoutButton label={t('shell.logout', lang)} />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-line bg-paper p-8 text-center shadow-card">
          <h1 className="text-2xl font-extrabold">{t(titleKey, lang)}</h1>
          <p className="mt-2 text-sm text-muted">
            {t('shell.welcome', lang)}, {profile.full_name ?? user.email}
          </p>
          {children ?? <p className="mt-4 text-sm text-muted">{t('home.placeholder', lang)}</p>}
          {allLinks.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {allLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted"
                >
                  {t(link.labelKey, lang)}
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
