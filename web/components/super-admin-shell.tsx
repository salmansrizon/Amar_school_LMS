'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LangSwitch } from '@/components/lang-switch'
import { LogoutButton } from '@/components/logout-button'
import { t, type Lang, type MessageKey } from '@/lib/i18n'

// Persistent sidebar shell for the whole /super-admin/* route group (map #158,
// ticket #160), mirroring the school-shell pattern: fixed sidebar nav with
// active-state per route + a topbar with language switch and logout. One shell
// wraps every super-admin page via app/super-admin/layout.tsx.

interface NavItem {
  href: string
  labelKey: MessageKey
  icon: React.ReactNode
}

// Lucide-style inline icons (no icon dep in web/), 24x24 stroke=currentColor.
const Icons = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  school: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  dealer: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  gov: (
    <>
      <path d="M3 21h18" />
      <path d="M6 21V10M10 21V10M14 21V10M18 21V10" />
      <path d="M4 10h16L12 3z" />
    </>
  ),
  codes: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h.01M11 15h2" />
    </>
  ),
  territory: (
    <>
      <path d="M9 20l-5.5 2V6L9 4l6 2 5.5-2v16L15 22z" />
      <path d="M9 4v16M15 6v16" />
    </>
  ),
  clusters: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M7.5 8 11 15.5M16.5 8 13 15.5" />
    </>
  ),
  sms: (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </>
  ),
  offDays: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
} as const

const NAV: NavItem[] = [
  { href: '/super-admin', labelKey: 'sa.nav.dashboard', icon: Icons.dashboard },
  { href: '/super-admin/schools', labelKey: 'sa.nav.schools', icon: Icons.school },
  { href: '/super-admin/partners', labelKey: 'sa.nav.dealers', icon: Icons.dealer },
  { href: '/super-admin/gov-officials', labelKey: 'sa.nav.gov', icon: Icons.gov },
  { href: '/super-admin/codes', labelKey: 'sa.nav.codes', icon: Icons.codes },
  { href: '/super-admin/locations', labelKey: 'sa.nav.territory', icon: Icons.territory },
  { href: '/super-admin/clusters', labelKey: 'sa.nav.clusters', icon: Icons.clusters },
  { href: '/super-admin/sms', labelKey: 'sa.nav.sms', icon: Icons.sms },
  { href: '/super-admin/off-days', labelKey: 'sa.nav.offDays', icon: Icons.offDays },
]

function isActive(pathname: string, href: string): boolean {
  return href === '/super-admin' ? pathname === '/super-admin' : pathname.startsWith(href)
}

function NavList({ pathname, lang, onNavigate }: { pathname: string; lang: Lang; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              active ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-brand-50/60 hover:text-brand-600'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`size-5 shrink-0 ${active ? 'text-brand-600' : 'text-muted'}`}
              aria-hidden="true"
            >
              {item.icon}
            </svg>
            <span className="truncate">{t(item.labelKey, lang)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function SuperAdminShell({
  fullName,
  lang,
  children,
}: {
  fullName: string
  lang: Lang
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="relative flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line/70 bg-paper px-4 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-base font-bold text-white shadow-sm">
            A
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-extrabold text-ink">{t('app.name', lang)}</div>
            <div className="truncate text-xs font-medium text-muted">{t('sa.title', lang)}</div>
          </div>
        </div>
        <NavList pathname={pathname} lang={lang} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="z-20 shrink-0 border-b border-line/70 bg-paper/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-ink lg:hidden">{t('sa.title', lang)}</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="hidden text-sm font-medium text-muted sm:inline">{fullName}</span>
              <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
              <LangSwitch lang={lang} />
              <LogoutButton
                label={<span className="hidden sm:inline">{t('shell.logout', lang)}</span>}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold text-muted transition hover:bg-brand-50 hover:text-brand-600"
              />
            </div>
          </div>
        </header>

        {/* Mobile horizontal nav */}
        <div className="border-b border-line/70 bg-paper px-2 py-2 lg:hidden">
          <div className="flex gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    active ? 'bg-brand-600 text-white' : 'text-muted hover:bg-brand-50'
                  }`}
                >
                  {t(item.labelKey, lang)}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex-1 bg-paper-muted">{children}</div>
      </div>
    </div>
  )
}
