'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LangSwitch } from '@/components/lang-switch'
import { LogoutButton } from '@/components/logout-button'
import { Icon } from '@/components/school-icons'
import { SearchPalette } from '@/components/search-palette'
import { NotificationBell } from '@/components/notification-bell'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { canOpenScreen } from '@/lib/auth/screens'
import type { ScreenKey } from '@/lib/auth/screens'
import type { Role } from '@/lib/auth/routing'
import { SCHOOL_MODULES, type SchoolNavItem } from '@/lib/school-nav'

// Persistent sidebar + topbar for the whole /school/* route group, restructured
// to ui/school-owner/dashboard.html's reference image: light icon nav + bottom
// "Add Student" CTA, topbar with global search / notifications / help / language
// pill / avatar / logout, and a floating chat button. One shell -> every page.

// Visible keyboard-focus ring (was missing — keyboard users had no focus cue).
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-paper'
// Icon buttons sized to the 44px minimum touch target.
const ICON_BTN = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full transition ${FOCUS}`

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'A'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

function NavLinks({
  role,
  grants,
  pathname,
  lang,
  collapsed = false,
  onNavigate,
}: {
  role: Role
  grants: readonly string[]
  pathname: string
  lang: Lang
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const items: {
    screen: ScreenKey | 'dashboard'
    href: string
    titleKey: MessageKey
    children?: SchoolNavItem[]
  }[] = [{ screen: 'dashboard', href: '/school', titleKey: 'dash.dashboard' }, ...SCHOOL_MODULES]
  // One link renderer, used for both levels: a child differs only by indent
  // (issue #101). Grants are still checked per entry — nesting is presentation.
  const renderLink = (
    item: { screen: ScreenKey | 'dashboard'; href: string; titleKey: MessageKey },
    child = false,
  ) => {
    if (item.screen !== 'dashboard' && !canOpenScreen(role, grants, item.screen)) return null
    const active = item.href === '/school' ? pathname === '/school' : pathname.startsWith(item.href)
    const label = t(item.titleKey, lang)
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? label : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition ${FOCUS} ${
          collapsed ? 'justify-center px-0' : child ? 'pl-9 pr-3' : 'px-3'
        } ${active ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-brand-50/60 hover:text-brand-600'}`}
      >
        <Icon
          name={item.screen}
          className={`shrink-0 ${child ? 'size-4' : 'size-5'} ${active ? 'text-brand-600' : 'text-muted'}`}
        />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    )
  }

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const children = 'children' in item ? (item.children ?? []) : []
        const parent = renderLink(item)
        if (!parent && !children.length) return null
        return (
          <div key={item.href} className="flex flex-col gap-1">
            {parent}
            {children.map((child) => renderLink(child, true))}
          </div>
        )
      })}
    </nav>
  )
}

function Brand({ schoolName, lang, collapsed = false }: { schoolName: string; lang: Lang; collapsed?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-1'}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-base font-bold text-white shadow-sm">
        {schoolName.trim()[0]?.toUpperCase() ?? 'A'}
      </span>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-extrabold text-ink">{schoolName}</div>
          <div className="truncate text-xs font-medium text-muted">{t('app.tagline', lang)}</div>
        </div>
      )}
    </div>
  )
}

function SidebarBody({
  role,
  grants,
  pathname,
  lang,
  schoolName,
  collapsed = false,
  onNavigate,
  onToggleCollapse,
}: {
  role: Role
  grants: readonly string[]
  pathname: string
  lang: Lang
  schoolName: string
  collapsed?: boolean
  onNavigate?: () => void
  onToggleCollapse?: () => void
}) {
  const canAddStudent = canOpenScreen(role, grants, 'students')
  const toggleLabel = collapsed ? t('shell.expandSidebar', lang) : t('shell.collapseSidebar', lang)
  return (
    <>
      {/* Header: brand + the collapse toggle (top, always visible) */}
      <div className={`mb-6 flex gap-2 ${collapsed ? 'flex-col items-center' : 'items-center'}`}>
        {collapsed ? (
          <Brand schoolName={schoolName} lang={lang} collapsed />
        ) : (
          <div className="min-w-0 flex-1">
            <Brand schoolName={schoolName} lang={lang} />
          </div>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={toggleLabel}
            title={toggleLabel}
            className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted transition hover:bg-brand-50 hover:text-brand-600 ${FOCUS}`}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} className="size-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks role={role} grants={grants} pathname={pathname} lang={lang} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      {canAddStudent && (
        <Link
          href="/school/students/new"
          onClick={onNavigate}
          title={collapsed ? t('shell.addStudent', lang) : undefined}
          className={`mt-4 flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-brand-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 ${FOCUS} ${
            collapsed ? 'px-0' : 'px-4'
          }`}
        >
          <Icon name="plus" className="size-4" />
          {!collapsed && t('shell.addStudent', lang)}
        </Link>
      )}
    </>
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // ⌘K / Ctrl+K opens the global search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    // Fixed app-shell: the viewport height is locked and only the main content
    // area scrolls, so the sidebar and topbar stay put while the page scrolls.
    <div className="relative flex h-dvh overflow-hidden">
      {/* Desktop sidebar (collapsible to an icon-only rail) */}
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-line/70 bg-paper py-5 transition-[width] lg:flex ${
          collapsed ? 'w-20 px-2' : 'w-64 px-4'
        }`}
      >
        <SidebarBody
          role={role}
          grants={grants}
          pathname={pathname}
          lang={lang}
          schoolName={schoolName}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-paper px-4 py-5 shadow-xl">
            <button
              type="button"
              aria-label="Close menu"
              className={`${ICON_BTN} absolute right-2 top-3 text-lg text-muted hover:bg-brand-50`}
              onClick={() => setDrawerOpen(false)}
            >
              ✕
            </button>
            <SidebarBody
              role={role}
              grants={grants}
              pathname={pathname}
              lang={lang}
              schoolName={schoolName}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar (fixed — outside the scroll area) */}
        <header className="z-20 shrink-0 border-b border-line/70 bg-paper/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              className={`${ICON_BTN} border border-line-strong text-ink hover:bg-brand-50 lg:hidden`}
              onClick={() => setDrawerOpen(true)}
            >
              <Icon name="menu" className="size-5" />
            </button>

            {/* Global search — opens the command palette (⌘K). Icon-only on phones. */}
            <button
              type="button"
              aria-label={t('shell.search', lang)}
              onClick={() => setSearchOpen(true)}
              className={`${ICON_BTN} border border-line-strong text-muted hover:bg-brand-50 hover:text-brand-600 md:hidden`}
            >
              <Icon name="search" className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t('shell.search', lang)}
              onClick={() => setSearchOpen(true)}
              className="relative hidden min-h-11 flex-1 cursor-text items-center rounded-full border border-line bg-paper-muted py-2.5 pl-11 pr-4 text-left text-sm text-muted transition hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 md:flex lg:max-w-md"
            >
              <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <span className="truncate">{t('shell.search', lang)}</span>
              <kbd className="ml-auto hidden shrink-0 rounded border border-line-strong bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-muted lg:inline">⌘K</kbd>
            </button>

            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2">
              <NotificationBell lang={lang} buttonClass={ICON_BTN} />

              <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

              <div className="shrink-0">
                <LangSwitch lang={lang} />
              </div>

              <Link
                href="/school/profile"
                title={fullName}
                aria-label={t('shell.profile', lang)}
                className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 transition hover:bg-brand-300 hover:text-white ${FOCUS}`}
              >
                {initials(fullName)}
              </Link>

              <LogoutButton
                label={<span className="hidden sm:inline">{t('shell.logout', lang)}</span>}
                icon={<Icon name="logout" className="size-4 shrink-0" />}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-muted transition hover:bg-brand-50 hover:text-brand-600 sm:px-2.5"
              />
            </div>
          </div>
        </header>

        <main className="relative flex-1 overflow-hidden bg-paper-muted">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgb(47_126_255_/_0.06),_transparent_28%),radial-gradient(circle_at_top_right,_rgb(0_210_106_/_0.06),_transparent_24%)]" />
          <div className="relative h-full overflow-y-auto overflow-x-hidden">
            <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-10 sm:px-6 lg:px-8">{children}</div>
          </div>
        </main>
      </div>

      {searchOpen && (
        <SearchPalette role={role} grants={grants} lang={lang} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  )
}
