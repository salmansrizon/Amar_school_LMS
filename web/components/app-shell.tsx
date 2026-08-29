'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import { LangSwitch } from '@/components/lang-switch'
import { ThemeSwitch } from '@/components/theme-switch'
import type { ThemePreference } from '@/lib/ui-prefs'
import { LogoutButton } from '@/components/logout-button'
import { Icon } from '@/components/school-icons'
import { t, type Lang } from '@/lib/i18n'
import { FOCUS_RING, ICON_BUTTON } from '@/lib/ui-tokens'
import { avatarInitials } from '@/lib/name'
import { sidebarCookieAssignment } from '@/lib/ui-prefs'
import { SearchPalette, type PaletteEntry } from '@/components/search-palette'
import { NotificationsBell } from '@/components/notifications-bell'

// The single, config-driven application shell (#285, map #284). Every role group
// renders THIS — one webframe: collapsible sidebar nav + topbar (search slot,
// notification slot, language, profile, logout) + mobile drawer + ⌘K. It carries
// no role knowledge; each layout hands it a nav tree and fills the optional slots
// (search palette, notification bell, extras, footer CTA). Generalized from the
// original school-shell; the school layout passes its bespoke bits as slots so no
// behaviour is lost. Print-neutralised so window.print() emits only <main>.

export interface AppNavItem {
  href: string
  label: string
  icon: React.ReactNode
  /** Root/home items match the path exactly; section items match by prefix. */
  matchExact?: boolean
  children?: AppNavItem[]
}

export interface AppShellBrand {
  title: string
  subtitle?: string
  /** Single-letter mark shown in the brand chip. */
  initial: string
  href?: string
}

export interface AppShellProfile {
  fullName: string
  label: string
  href?: string
}

export interface AppShellSearch {
  label: string
  /** The palette's entries. NOT a render function: this shell is a Client
   *  Component and every role layout that supplies search is a Server one, so a
   *  function here cannot cross the boundary ("Functions cannot be passed
   *  directly to Client Components"). Elements can — `icon` is a ReactNode and
   *  travels in the RSC payload — so the shell owns the palette and its own
   *  onClose, and the layout only describes what to search. */
  entries: PaletteEntry[]
}

function isActive(pathname: string, item: AppNavItem): boolean {
  return item.matchExact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')
}

function NavLinks({
  nav,
  pathname,
  lang,
  collapsed,
  onNavigate,
}: {
  nav: AppNavItem[]
  pathname: string
  lang: Lang
  collapsed: boolean
  onNavigate?: () => void
}) {
  const renderLink = (item: AppNavItem) => {
    const active = isActive(pathname, item)
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition ${FOCUS_RING} ${
          collapsed ? 'justify-center px-0' : 'px-3'
        } ${active ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-brand-50/60 hover:text-brand-600'}`}
      >
        <span className={`grid size-5 shrink-0 place-items-center ${active ? 'text-brand-600' : 'text-muted'}`}>
          {item.icon}
        </span>
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    )
  }

  return (
    <nav className="flex flex-col gap-1" aria-label={t('shell.nav', lang)}>
      {nav.map((item) => (
        <div key={item.href} className="flex flex-col gap-1">
          {renderLink(item)}
          {item.children?.map((child) => renderLink(child))}
        </div>
      ))}
    </nav>
  )
}

function Brand({ brand, lang, collapsed }: { brand: AppShellBrand; lang: Lang; collapsed: boolean }) {
  const inner = (
    <div className={`flex items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-1'}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-base font-bold text-white shadow-sm">
        {brand.initial.trim()[0]?.toUpperCase() ?? 'E'}
      </span>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-extrabold text-ink">{brand.title}</div>
          <div className="truncate text-xs font-medium text-muted">{brand.subtitle ?? t('app.tagline', lang)}</div>
        </div>
      )}
    </div>
  )
  return brand.href ? (
    <Link href={brand.href} className={`block rounded-xl ${FOCUS_RING}`}>
      {inner}
    </Link>
  ) : (
    inner
  )
}

function SidebarBody({
  brand,
  nav,
  pathname,
  lang,
  collapsed,
  onNavigate,
  onToggleCollapse,
  footerCta,
}: {
  brand: AppShellBrand
  nav: AppNavItem[]
  pathname: string
  lang: Lang
  collapsed: boolean
  onNavigate?: () => void
  onToggleCollapse?: () => void
  footerCta?: React.ReactNode
}) {
  const toggleLabel = collapsed ? t('shell.expandSidebar', lang) : t('shell.collapseSidebar', lang)
  return (
    <>
      <div className={`mb-6 flex gap-2 ${collapsed ? 'flex-col items-center' : 'items-center'}`}>
        {collapsed ? (
          <Brand brand={brand} lang={lang} collapsed />
        ) : (
          <div className="min-w-0 flex-1">
            <Brand brand={brand} lang={lang} collapsed={false} />
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
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} className="size-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks nav={nav} pathname={pathname} lang={lang} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      {footerCta && <div className="mt-4">{footerCta}</div>}
    </>
  )
}

export function AppShell({
  brand,
  nav,
  profile,
  lang,
  theme = 'system',
  initialCollapsed = false,
  search,
  bell,
  notificationsHref,
  topbarExtras,
  banner,
  footerCta,
  contentContainer = true,
  children,
}: {
  brand: AppShellBrand
  nav: AppNavItem[]
  profile: AppShellProfile
  lang: Lang
  /** Persisted theme choice, read from the cookie by the layout (map #370). Only
   *  drives which control reads as active — the palette itself is already applied
   *  by `data-theme` on <html>, so a wrong default here cannot mis-paint the page. */
  theme?: ThemePreference
  initialCollapsed?: boolean
  /** Global search slot (⌘K). Omit to hide search for a role until wired (#286). */
  search?: AppShellSearch
  /** Notification bell node. Omit until wired for the role (#287). */
  bell?: React.ReactNode
  /** Inbox route for the default bell's "view all", when the group has its own. */
  notificationsHref?: string
  /** Extra topbar controls before the bell (e.g. SMS balance badge). */
  topbarExtras?: React.ReactNode
  /** Strip under the topbar (e.g. subscription reminder). */
  banner?: React.ReactNode
  /** Sidebar footer CTA (e.g. Add Student). */
  footerCta?: React.ReactNode
  /** True = shell provides the <main> + max-w container (school pages render bare
   *  content). False = each page owns its own <main>; the shell only scrolls, so
   *  no nested <main> / double gutter (super-admin, distributor, agent, gov). */
  contentContainer?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  const toggleCollapsed = () =>
    setCollapsed((v) => {
      const next = !v
      document.cookie = sidebarCookieAssignment(next)
      return next
    })

  // Search source: an explicit slot (school's rich feature index) wins; otherwise
  // derive a nav-section index so every role gets ⌘K search for free (#286).
  const navEntries: PaletteEntry[] = nav.flatMap((item) => [
    { label: item.label, keywords: [item.label], href: item.href, icon: item.icon },
    ...(item.children ?? []).map((c) => ({ label: c.label, keywords: [c.label], href: c.href, icon: c.icon })),
  ])
  const hasSearch = Boolean(search) || navEntries.length > 0
  const searchLabel = search?.label ?? t('shell.search', lang)

  useEffect(() => {
    if (!hasSearch) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasSearch])

  return (
    <div className="relative flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-line/70 bg-paper py-5 transition-[width] print:hidden lg:flex ${
          collapsed ? 'w-20 px-2' : 'w-64 px-4'
        }`}
      >
        <SidebarBody
          brand={brand}
          nav={nav}
          pathname={pathname}
          lang={lang}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          footerCta={footerCta}
        />
      </aside>

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
            <SidebarBody
              brand={brand}
              nav={nav}
              pathname={pathname}
              lang={lang}
              collapsed={false}
              onNavigate={() => setDrawerOpen(false)}
              footerCta={footerCta}
            />
            {/* The header has no room for these on a phone (see above), and a
                Bangla-default product cannot hide its language switch. */}
            <div className="mt-4 flex shrink-0 items-center justify-between gap-2 border-t border-line/70 pt-4 sm:hidden">
              <ThemeSwitch preference={theme} lang={lang} />
              <LangSwitch lang={lang} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        {/* Keyboard users landed in a 12-item sidebar on every navigation with
            no way past it. Visible only when focused. */}
        <a
          href="#app-content"
          className={`sr-only z-30 focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:rounded-full focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white ${FOCUS_RING}`}
        >
          {t('shell.skipToContent', lang)}
        </a>
        <header className="z-20 shrink-0 border-b border-line/70 bg-paper/90 px-4 py-3 backdrop-blur print:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              className={`${ICON_BUTTON} border border-line-strong text-ink hover:bg-brand-50 lg:hidden`}
              onClick={() => setDrawerOpen(true)}
            >
              <Icon name="menu" className="size-5" />
            </button>

            {hasSearch ? (
              <>
                <button
                  type="button"
                  aria-label={searchLabel}
                  onClick={() => setSearchOpen(true)}
                  className={`${ICON_BUTTON} border border-line-strong text-muted hover:bg-brand-50 hover:text-brand-600 md:hidden`}
                >
                  <Icon name="search" className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={searchLabel}
                  onClick={() => setSearchOpen(true)}
                  className="relative hidden min-h-11 flex-1 cursor-text items-center rounded-full border border-line bg-paper-muted py-2.5 pl-11 pr-4 text-left text-sm text-muted transition hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 md:flex lg:max-w-md"
                >
                  <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <span className="truncate">{searchLabel}</span>
                  <kbd className="ml-auto hidden shrink-0 rounded border border-line-strong bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-muted lg:inline">⌘K</kbd>
                </button>
              </>
            ) : (
              <div className="flex-1" />
            )}

            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2">
              {topbarExtras}
              {bell ?? (
                <NotificationsBell
                  lang={lang}
                  buttonClass={ICON_BUTTON}
                  viewAllHref={notificationsHref}
                />
              )}
              <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
              {/* Theme + language are ~150px of a 390px header. Keeping them here
                  on a phone pushed the avatar and Log out off-screen entirely,
                  with nothing to scroll — so below sm they live in the drawer. */}
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                <ThemeSwitch preference={theme} lang={lang} />
                <LangSwitch lang={lang} />
              </div>
              {profile.href ? (
                <Link
                  href={profile.href}
                  title={profile.fullName}
                  aria-label={profile.label}
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 transition hover:bg-brand-300 hover:text-white ${FOCUS_RING}`}
                >
                  {avatarInitials(profile.fullName)}
                </Link>
              ) : (
                <span
                  title={profile.fullName}
                  aria-label={profile.label}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700"
                >
                  {avatarInitials(profile.fullName)}
                </span>
              )}
              <LogoutButton
                label={<span className="hidden sm:inline">{t('shell.logout', lang)}</span>}
                icon={<Icon name="logout" className="size-4 shrink-0" />}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-muted transition hover:bg-brand-50 hover:text-brand-600 sm:px-2.5"
              />
            </div>
          </div>
        </header>

        {banner && <div className="shrink-0 print:hidden">{banner}</div>}

        {/* Scroll frame owns only scroll + background; the <main> landmark is the
            inner container (contentContainer) or the page's own <main> (else). */}
        <div className="relative flex-1 overflow-hidden bg-paper-muted print:overflow-visible print:bg-transparent">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--color-brand-500)_6%,transparent),transparent_28%),radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--color-mint)_6%,transparent),transparent_24%)] print:hidden" />
          <div id="app-content" tabIndex={-1} className="relative h-full overflow-y-auto overflow-x-hidden print:h-auto print:overflow-visible">
            {/* Fluid content (map #370). The old `max-w-7xl` capped every page at
                1280px, so a 1920px screen wasted ~280px of dead gutter on each
                side. ERP/CRM layouts fill the viewport instead; a page that needs
                a readable measure gets it from its own archetype (forms go
                multi-column within the width, not narrower than it). Gutters are
                applied once, here, using the shared density scale. */}
            {contentContainer ? (
              <main className="w-full px-gutter pt-section pb-16 print:max-w-none print:p-0">
                {children}
              </main>
            ) : (
              children
            )}
          </div>
        </div>
      </div>

      {hasSearch &&
        searchOpen &&
        <SearchPalette
          entries={search ? search.entries : navEntries}
          lang={lang}
          onClose={() => setSearchOpen(false)}
        />}

      <Toaster theme={theme} position="top-right" richColors closeButton />
    </div>
  )
}
