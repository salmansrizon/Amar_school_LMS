'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LangSwitch } from '@/components/lang-switch'
import { LogoutButton } from '@/components/logout-button'
import { BrandMark } from '@/components/brand-logo'
import { StrokeIcon } from '@/components/stroke-icon'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { isNavActive } from '@/lib/super-admin/shell-nav'
import { avatarInitials } from '@/lib/name'
import { FOCUS_RING, ICON_BUTTON } from '@/lib/ui-tokens'
import { sidebarCookieAssignment } from '@/lib/ui-prefs'

// Persistent chrome for the whole /super-admin/* route group (map #158 origin,
// modernised in map #171 T1 to the school-shell design language): a collapsible
// desktop rail, a mobile drawer, a fixed app-shell (only the content scrolls), a
// topbar with avatar / language / logout, and an optional banner slot. Mirrors
// components/school-shell.tsx so both areas share one look, spacing and a11y
// baseline (focus rings, 44px touch targets). Nav entries and their inline icons
// stay super-admin-specific.
//
// The content frame deliberately owns only the scroll + background: unlike
// school-shell it does NOT impose a <main>, max-width or padding, because the
// existing super-admin subpages each render their own <main class max-w-* p-6>
// (map #158). Adding a container here would nest <main> landmarks and double the
// gutter. Those pages fold their layout into the shell as they are restyled (T3/
// T4/T10); until then the shell must stay container-neutral.

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
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
} as const

const NAV: NavItem[] = [
  { href: '/super-admin', labelKey: 'sa.nav.dashboard', icon: Icons.dashboard },
  { href: '/super-admin/schools', labelKey: 'sa.nav.schools', icon: Icons.school },
  { href: '/super-admin/partners', labelKey: 'sa.nav.dealers', icon: Icons.dealer },
  { href: '/super-admin/codes', labelKey: 'sa.nav.codes', icon: Icons.codes },
  { href: '/super-admin/gov-officials', labelKey: 'sa.nav.gov', icon: Icons.gov },
  { href: '/super-admin/locations', labelKey: 'sa.nav.territory', icon: Icons.territory },
  { href: '/super-admin/clusters', labelKey: 'sa.nav.clusters', icon: Icons.clusters },
  { href: '/super-admin/sms', labelKey: 'sa.nav.sms', icon: Icons.sms },
  { href: '/super-admin/off-days', labelKey: 'sa.nav.offDays', icon: Icons.offDays },
]

function NavList({
  pathname,
  lang,
  collapsed = false,
  onNavigate,
}: {
  pathname: string
  lang: Lang
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = isNavActive(pathname, item.href)
        const label = t(item.labelKey, lang)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? label : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition ${FOCUS_RING} ${
              collapsed ? 'justify-center px-0' : 'px-3'
            } ${active ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-brand-50/60 hover:text-brand-600'}`}
          >
            <StrokeIcon className={`size-5 shrink-0 ${active ? 'text-brand-600' : 'text-muted'}`}>
              {item.icon}
            </StrokeIcon>
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        )
      })}
    </nav>
  )
}

function Brand({ lang, collapsed = false }: { lang: Lang; collapsed?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-1'}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
        <BrandMark className="size-6" />
      </span>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-extrabold text-ink">{t('app.name', lang)}</div>
          <div className="truncate text-xs font-medium text-muted">{t('sa.title', lang)}</div>
        </div>
      )}
    </div>
  )
}

function SidebarBody({
  pathname,
  lang,
  collapsed = false,
  onNavigate,
  onToggleCollapse,
}: {
  pathname: string
  lang: Lang
  collapsed?: boolean
  onNavigate?: () => void
  onToggleCollapse?: () => void
}) {
  const toggleLabel = collapsed ? t('shell.expandSidebar', lang) : t('shell.collapseSidebar', lang)
  return (
    <>
      <div className={`mb-6 flex gap-2 ${collapsed ? 'flex-col items-center' : 'items-center'}`}>
        {collapsed ? (
          <Brand lang={lang} collapsed />
        ) : (
          <div className="min-w-0 flex-1">
            <Brand lang={lang} />
          </div>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={toggleLabel}
            title={toggleLabel}
            className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted transition hover:bg-brand-50 hover:text-brand-600 ${FOCUS_RING}`}
          >
            <StrokeIcon className="size-4">{collapsed ? Icons.chevronRight : Icons.chevronLeft}</StrokeIcon>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavList pathname={pathname} lang={lang} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </>
  )
}

export function SuperAdminShell({
  fullName,
  lang,
  initialCollapsed = false,
  children,
}: {
  fullName: string
  lang: Lang
  /** Persisted collapse choice, read from the cookie server-side (issue #115). */
  initialCollapsed?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  const toggleCollapsed = () =>
    setCollapsed((v) => {
      const next = !v
      document.cookie = sidebarCookieAssignment(next)
      return next
    })

  return (
    <div className="relative flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* Desktop sidebar (collapsible to an icon-only rail) */}
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-line/70 bg-paper py-5 transition-[width] print:hidden lg:flex ${
          collapsed ? 'w-20 px-2' : 'w-64 px-4'
        }`}
      >
        <SidebarBody
          pathname={pathname}
          lang={lang}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
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
              className={`${ICON_BUTTON} absolute right-2 top-3 text-lg text-muted hover:bg-brand-50`}
              onClick={() => setDrawerOpen(false)}
            >
              ✕
            </button>
            <SidebarBody pathname={pathname} lang={lang} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        {/* Topbar (fixed — outside the scroll area) */}
        <header className="z-20 shrink-0 border-b border-line/70 bg-paper/90 px-4 py-3 backdrop-blur print:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              className={`${ICON_BUTTON} border border-line-strong text-ink hover:bg-brand-50 lg:hidden`}
              onClick={() => setDrawerOpen(true)}
            >
              <StrokeIcon className="size-5">{Icons.menu}</StrokeIcon>
            </button>

            <span className="font-extrabold text-ink lg:hidden">{t('sa.title', lang)}</span>

            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2">
              <span className="hidden text-sm font-medium text-muted sm:inline">{fullName}</span>
              <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
              <LangSwitch lang={lang} />
              <span
                title={fullName}
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700"
              >
                {avatarInitials(fullName)}
              </span>
              <LogoutButton
                label={<span className="hidden sm:inline">{t('shell.logout', lang)}</span>}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-muted transition hover:bg-brand-50 hover:text-brand-600 sm:px-2.5"
              />
            </div>
          </div>
        </header>

        {/* Scroll frame + subtle gradient only — the page owns its <main>, width
            and padding (see the header note), so nothing is nested or doubled. */}
        <div className="relative flex-1 overflow-hidden bg-paper-muted print:overflow-visible print:bg-transparent">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--color-brand-500)_6%,transparent),transparent_28%),radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--color-mint)_6%,transparent),transparent_24%)] print:hidden" />
          <div className="relative flex h-full flex-col overflow-y-auto overflow-x-hidden print:h-auto print:overflow-visible">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
