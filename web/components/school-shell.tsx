'use client'

import Link from 'next/link'
import type { ThemePreference } from '@/lib/ui-prefs'
import { AppShell, type AppNavItem } from '@/components/app-shell'
import { Icon } from '@/components/school-icons'
import { SearchPalette, type PaletteEntry } from '@/components/search-palette'
import { NotificationBell } from '@/components/notification-bell'
import { SCHOOL_SEARCH } from '@/lib/school-search'
import { t, type Lang } from '@/lib/i18n'
import { FOCUS_RING, ICON_BUTTON } from '@/lib/ui-tokens'
import { canOpenScreen } from '@/lib/auth/screens'
import type { ScreenKey } from '@/lib/auth/screens'
import type { Role } from '@/lib/auth/routing'
import { SCHOOL_MODULES } from '@/lib/school-nav'
import { FEATURE_KEYS } from '@/lib/engines/feature/catalog'
import type { SchoolSmsCredit } from '@/lib/sms/credit'

// SMS-balance badge styling by level (map #171 T9).
const SMS_BADGE_STYLE = {
  ok: 'border-line-strong text-muted hover:bg-brand-50 hover:text-brand-600',
  low: 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100',
  empty: 'border-alert/40 bg-alert-soft text-alert-deep hover:bg-alert-soft',
} as const

// School route-group chrome. Now a thin adapter over the shared AppShell (#285):
// it builds the grant/feature-gated school nav and passes the school-specific
// slots (SMS badge, notification bell, global search, Add-Student CTA). Nesting
// is grouping only (same row style at both levels, ui.md issue 1), so the tree is
// flattened in visible order — behaviour-preserving vs the previous bespoke shell.
function buildSchoolNav(
  role: Role,
  grants: readonly string[],
  lang: Lang,
  enabledFeatures?: readonly string[],
): AppNavItem[] {
  const allow = (screen: ScreenKey | 'dashboard') => {
    if (screen !== 'dashboard' && !canOpenScreen(role, grants, screen)) return false
    if (
      enabledFeatures &&
      (FEATURE_KEYS as readonly string[]).includes(screen) &&
      !enabledFeatures.includes(screen)
    ) {
      return false
    }
    return true
  }
  const toItem = (it: {
    screen: ScreenKey | 'dashboard'
    href: string
    titleKey: Parameters<typeof t>[0]
    icon?: string
  }): AppNavItem => ({
    href: it.href,
    label: t(it.titleKey, lang),
    // An entry riding the always-available sentinel names its own glyph, or it
    // would wear the dashboard's (lib/school-nav.ts).
    icon: <Icon name={(it.icon ?? it.screen) as Parameters<typeof Icon>[0]['name']} className="size-5" />,
    matchExact: it.href === '/school',
  })

  const src = [
    { screen: 'dashboard' as const, href: '/school', titleKey: 'dash.dashboard' as const },
    ...SCHOOL_MODULES,
  ]
  const out: AppNavItem[] = []
  for (const it of src) {
    if (allow(it.screen)) out.push(toItem(it))
    for (const child of 'children' in it ? (it.children ?? []) : []) {
      if (allow(child.screen)) out.push(toItem(child))
    }
  }
  return out
}

export function SchoolShell({
  role,
  grants,
  schoolName,
  fullName,
  lang,
  theme = 'system',
  initialCollapsed = false,
  banner,
  smsCredit = null,
  enabledFeatures,
  children,
}: {
  role: Role
  grants: readonly string[]
  schoolName: string
  fullName: string
  lang: Lang
  theme?: ThemePreference
  initialCollapsed?: boolean
  banner?: React.ReactNode
  smsCredit?: SchoolSmsCredit | null
  enabledFeatures?: readonly string[]
  children: React.ReactNode
}) {
  const nav = buildSchoolNav(role, grants, lang, enabledFeatures)
  const canAddStudent = canOpenScreen(role, grants, 'students')

  // School keeps its rich feature index (keywords per screen), grant-filtered.
  const searchEntries: PaletteEntry[] = SCHOOL_SEARCH.filter(
    (e) => e.screen === 'dashboard' || canOpenScreen(role, grants, e.screen as ScreenKey),
  ).map((e) => ({
    label: t(e.titleKey, lang),
    keywords: e.keywords,
    href: e.href,
    icon: <Icon name={e.screen} className="size-4" />,
  }))

  const footerCta = canAddStudent ? (
    <Link
      href="/school/students/new"
      title={t('shell.addStudent', lang)}
      className={`flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 ${FOCUS_RING}`}
    >
      <Icon name="plus" className="size-4" />
      {t('shell.addStudent', lang)}
    </Link>
  ) : undefined

  const topbarExtras = smsCredit ? (
    <Link
      href="/school/sms"
      title={t('sms.balance', lang)}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${FOCUS_RING} ${SMS_BADGE_STYLE[smsCredit.level]}`}
    >
      <Icon name="sms" className="size-4 shrink-0" />
      <span>{smsCredit.balance}</span>
    </Link>
  ) : undefined

  return (
    <AppShell
      brand={{ title: schoolName, initial: schoolName, subtitle: t('app.tagline', lang) }}
      nav={nav}
      profile={{ fullName, label: t('shell.profile', lang), href: '/school/profile' }}
      lang={lang}
      theme={theme}
      initialCollapsed={initialCollapsed}
      search={{
        label: t('shell.search', lang),
        entries: searchEntries,
      }}
      bell={<NotificationBell lang={lang} buttonClass={ICON_BUTTON} />}
      topbarExtras={topbarExtras}
      banner={banner}
      footerCta={footerCta}
    >
      {children}
    </AppShell>
  )
}
