'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ThemePreference } from '@/lib/ui-prefs'
import { AppShell, type AppNavItem } from '@/components/app-shell'
import { Icon } from '@/components/school-icons'
import type { PaletteEntry } from '@/components/search-palette'
import { NotificationBell } from '@/components/notification-bell'
import { ShiftSelector } from '@/components/shift-selector'
import { SCHOOL_SEARCH } from '@/lib/school-search'
import { numberFmt, t, type Lang } from '@/lib/i18n'
import { FOCUS_RING, ICON_BUTTON } from '@/lib/ui-tokens'
import { canOpenScreen, FEATURE_KEYS } from '@/lib/auth/screens'
import type { Role } from '@/lib/auth/routing'
import { SCHOOL_NAV_GROUPS, flattenSchoolModules, navGroupFor, type SchoolNavItem } from '@/lib/school-nav'
import type { SchoolSmsCredit } from '@/lib/sms/credit'

// SMS-balance badge styling by level (map #171 T9).
const SMS_BADGE_STYLE = {
  ok: 'border-brand-100 bg-brand-50 text-brand-700 hover:border-brand-300',
  low: 'border-sun/50 bg-sun-soft text-sun-deep hover:border-sun',
  empty: 'border-alert/40 bg-alert-soft text-alert-deep hover:border-alert',
} as const

// School route-group chrome. Now a thin adapter over the shared AppShell (#285):
// it builds the grant/feature-gated school nav and passes the school-specific
// slots (SMS badge, notification bell, global search, Add-Student CTA). Classes
// -> Attendance nesting is grouping only (same row style at both levels, ui.md
// issue 1), so that one level is flattened into visible order. Attendance's OWN
// children (Off-Day Calendar/Students/Employees/Machine, map #667) are a second,
// different kind of nesting: they're attached as real `AppNavItem.children`, so
// AppShell's NavLinks renders them indented and always-visible under Attendance,
// never flattened into more top-level-styled rows.
type Allow = (screen: SchoolNavItem['screen']) => boolean

function schoolAllow(role: Role, grants: readonly string[], enabledFeatures?: readonly string[]): Allow {
  return (screen) => {
    if (!canOpenScreen(role, grants, screen)) return false
    if (
      enabledFeatures &&
      (FEATURE_KEYS as readonly string[]).includes(screen) &&
      !enabledFeatures.includes(screen)
    ) {
      return false
    }
    return true
  }
}

function buildSchoolNav(allow: Allow, lang: Lang): AppNavItem[] {
  const out: AppNavItem[] = []
  for (const group of SCHOOL_NAV_GROUPS) {
    const section = t(group.labelKey, lang)
    const toItem = (it: SchoolNavItem): AppNavItem => ({
      href: it.href,
      label: t(it.titleKey, lang),
      // An entry riding the always-available sentinel names its own glyph, or it
      // would wear the dashboard's (lib/school-nav.ts).
      icon: <Icon name={(it.icon ?? it.screen) as Parameters<typeof Icon>[0]['name']} className="size-5" />,
      matchExact: it.href === '/school',
      matchPrefixes: it.matchPrefixes,
      section,
    })
    for (const it of group.items) {
      if (allow(it.screen)) out.push(toItem(it))
      for (const child of it.children ?? []) {
        if (!allow(child.screen)) continue
        const grandchildren = (child.children ?? []).filter((gc) => allow(gc.screen)).map(toItem)
        out.push(grandchildren.length ? { ...toItem(child), children: grandchildren } : toItem(child))
      }
    }
  }
  return out
}

// Phone bottom tab bar (map 013 F5): one tab per nav group, pointing at the
// group's first screen this user can open; a group with none is hidden.
function SchoolBottomNav({ allow, lang }: { allow: Allow; lang: Lang }) {
  const pathname = usePathname()
  const activeKey = navGroupFor(pathname)?.group.key
  const tabs = SCHOOL_NAV_GROUPS.flatMap((group) => {
    const first = flattenSchoolModules(group.items).find((it) => allow(it.screen))
    return first ? [{ group, href: first.href }] : []
  })
  if (tabs.length === 0) return null
  return (
    <nav
      aria-label={t('shell.bottomNav', lang)}
      className="border-t border-line/70 bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {tabs.map(({ group, href }) => {
          const active = group.key === activeKey
          return (
            <li key={group.key} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold transition-transform motion-safe:active:scale-95 ${FOCUS_RING} ${
                  active ? 'text-brand-600' : 'text-muted hover:text-brand-600'
                }`}
              >
                <Icon name={group.icon as Parameters<typeof Icon>[0]['name']} className="size-5" />
                <span className="max-w-full truncate">{t(group.shortLabelKey, lang)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
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
  configuredShifts = [],
  shiftSelection = [],
  startedAcademicYears = [],
  activeAcademicYear = null,
  academicYearSelection = [],
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
  /** Global Shift Selection (issue #577, Wave 5/#590) — configuredShifts empty
   *  means a No-Shift institute, so the selector doesn't render at all. */
  configuredShifts?: readonly string[]
  shiftSelection?: readonly string[]
  /** Global Academic Year Selection (map #609, ticket #613) — the year twin of
   *  the shift preference, folded into the same popover. The section renders
   *  only when startedAcademicYears has more than one entry. */
  startedAcademicYears?: readonly number[]
  activeAcademicYear?: number | null
  academicYearSelection?: readonly number[]
  children: React.ReactNode
}) {
  const allow = schoolAllow(role, grants, enabledFeatures)
  const nav = buildSchoolNav(allow, lang)
  const canAddStudent = canOpenScreen(role, grants, 'students')

  // School keeps its rich feature index (keywords per screen), grant-filtered.
  const searchEntries: PaletteEntry[] = SCHOOL_SEARCH.filter((e) =>
    canOpenScreen(role, grants, e.screen),
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
      <Icon name="plus" className="size-5" />
      <span>{t('shell.addStudent', lang)}</span>
    </Link>
  ) : undefined

  const smsBadge = smsCredit ? (
    <Link
      href="/school/sms"
      title={t('sms.balance', lang)}
      aria-label={`${t('sms.balance', lang)}: ${smsCredit.balance}`}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${FOCUS_RING} ${SMS_BADGE_STYLE[smsCredit.level]}`}
    >
      <Icon name="sms" className="size-4 shrink-0" />
      <span>
        <span className="hidden lg:inline">{t('sms.chipLabel', lang)}: </span>
        {numberFmt(lang).format(smsCredit.balance)}
        <span className="hidden lg:inline"> {t('sms.chipCredit', lang)}</span>
      </span>
    </Link>
  ) : undefined

  const shiftSelector = (
    <ShiftSelector
      lang={lang}
      configuredShifts={configuredShifts}
      initialSelection={shiftSelection}
      startedAcademicYears={startedAcademicYears}
      activeAcademicYear={activeAcademicYear}
      academicYearSelection={academicYearSelection}
    />
  )

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
      topbarLead={shiftSelector}
      topbarExtras={smsBadge}
      bottomNav={role === 'school_owner' ? <SchoolBottomNav allow={allow} lang={lang} /> : undefined}
      banner={banner}
      footerCta={footerCta}
    >
      {children}
    </AppShell>
  )
}
