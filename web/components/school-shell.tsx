'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { LangSwitch } from '@/components/lang-switch'
import { LogoutButton } from '@/components/logout-button'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { canOpenScreen } from '@/lib/auth/screens'
import type { Role } from '@/lib/auth/routing'
import { SCHOOL_MODULES } from '@/lib/school-nav'

// Persistent sidebar + topbar for the whole /school/* route group, per
// ui/school-owner/dashboard.html's app-shell (sidebar nav, active-state
// highlight). Wraps every school page via app/school/layout.tsx — existing
// feature pages need no changes to pick it up.

function NavLinks({
  role,
  grants,
  pathname,
  lang,
  onNavigate,
}: {
  role: Role
  grants: readonly string[]
  pathname: string
  lang: Lang
  onNavigate?: () => void
}) {
  const items = [
    { screen: 'dashboard' as const, href: '/school', titleKey: 'dash.dashboard' as MessageKey },
    ...SCHOOL_MODULES,
  ]
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        if (item.screen !== 'dashboard' && !canOpenScreen(role, grants, item.screen)) return null
        const active = item.href === '/school' ? pathname === '/school' : pathname.startsWith(item.href)
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              active ? 'bg-brand-500 text-white shadow-sm' : 'text-ink hover:bg-brand-50 hover:text-brand-600'
            }`}
          >
            {t(item.titleKey, lang)}
          </a>
        )
      })}
    </nav>
  )
}

export function SchoolShell({
  role,
  grants,
  schoolName,
  fullName,
  lang,
  children,
}: {
  role: Role
  grants: readonly string[]
  schoolName: string
  fullName: string
  lang: Lang
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="relative flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line/70 bg-paper/95 px-4 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-1 font-extrabold">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-brand-500 text-sm font-bold text-white shadow-sm">
            A
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-muted">{t('app.name', lang)}</div>
            <div className="truncate text-sm font-extrabold">{schoolName}</div>
          </div>
        </div>
        <NavLinks role={role} grants={grants} pathname={pathname} lang={lang} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-paper px-4 py-5 shadow-xl">
            <div className="mb-6 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 font-extrabold">
                <span className="flex size-9 items-center justify-center rounded-2xl bg-brand-500 text-sm font-bold text-white shadow-sm">
                  A
                </span>
                <div className="truncate text-sm font-extrabold">{schoolName}</div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                className="rounded-full px-2 py-1 text-lg text-muted hover:bg-brand-50"
                onClick={() => setDrawerOpen(false)}
              >
                ✕
              </button>
            </div>
            <NavLinks role={role} grants={grants} pathname={pathname} lang={lang} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/60 bg-paper/80 px-4 py-3 text-ink shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Open menu"
                className="rounded-full border border-line-strong px-2.5 py-1.5 text-base lg:hidden"
                onClick={() => setDrawerOpen(true)}
              >
                ☰
              </button>
              <span className="hidden text-sm font-semibold text-muted sm:inline lg:hidden">{schoolName}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="hidden truncate text-sm font-medium text-muted sm:inline">{fullName}</span>
              <LangSwitch lang={lang} />
              <LogoutButton label={t('shell.logout', lang)} />
            </div>
          </div>
        </header>
        <main className="relative flex-1 overflow-x-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgb(47_126_255_/_0.06),_transparent_28%),radial-gradient(circle_at_top_right,_rgb(0_210_106_/_0.06),_transparent_24%)]" />
          <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
