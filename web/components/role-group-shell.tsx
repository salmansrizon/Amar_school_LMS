import Link from 'next/link'
import { LangSwitch } from '@/components/lang-switch'
import { LogoutButton } from '@/components/logout-button'
import { BrandMark } from '@/components/brand-logo'
import { t, type Lang, type MessageKey } from '@/lib/i18n'

// Shared chrome for the single-role app groups (/distributor, /agent): topbar +
// a horizontal quick-link nav. The role guard stays in each group's layout; this
// is presentation only, so a chrome change lands in one place.
export function RoleGroupShell({
  lang,
  links,
  children,
}: {
  lang: Lang
  links: { href: string; labelKey: MessageKey }[]
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line bg-ink px-4 py-3 text-white">
        <div className="flex items-center gap-2 font-extrabold">
          <span className="flex size-7 items-center justify-center rounded-sm bg-brand-500 text-white">
            <BrandMark className="size-4" />
          </span>
          {t('app.name', lang)}
        </div>
        <div className="flex items-center gap-3">
          <LangSwitch lang={lang} />
          <LogoutButton label={t('shell.logout', lang)} />
        </div>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-line bg-paper px-4 py-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-muted hover:bg-brand-50/60 hover:text-brand-600"
          >
            {t(l.labelKey, lang)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
