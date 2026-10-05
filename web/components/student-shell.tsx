'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppShell, type AppNavItem } from '@/components/app-shell'
import { Icon } from '@/components/school-icons'
import { StrokeIcon } from '@/components/stroke-icon'
import { t, type Lang } from '@/lib/i18n'
import { FOCUS_RING } from '@/lib/ui-tokens'
import { STUDENT_SEARCH } from '@/lib/school-search'
import { STUDENT_NAV_GROUPS, studentGroupFor, type StudentNavItemKey } from '@/lib/student-nav'

// /student/* chrome: a thin adapter over AppShell (#285), mirroring
// school-shell.tsx. Nav is grouped (sidebar sections + phone bottom tabs).

const ITEM_ICONS: Record<StudentNavItemKey, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  routine: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4" />
    </>
  ),
  notices: (
    <>
      <path d="M4 4h16v13H8l-4 4V4Z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  tasks: (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  materials: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
      <path d="M15 3v5h5" />
    </>
  ),
  results: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M7 11v5c0 1.1 2.2 2 5 2s5-.9 5-2v-5" />
    </>
  ),
  exams: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </>
  ),
  attendance: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4M9 15l2 2 4-4" />
    </>
  ),
  leave: (
    <>
      <path d="M12 3v9l5 3" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  fees: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  questions: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" />
    </>
  ),
}

function buildStudentNav(lang: Lang): AppNavItem[] {
  return STUDENT_NAV_GROUPS.flatMap((group) => {
    const section = t(group.labelKey, lang)
    return group.items.map((it) => ({
      href: it.href,
      label: t(it.titleKey, lang),
      icon: <StrokeIcon className="size-5">{ITEM_ICONS[it.key]}</StrokeIcon>,
      matchExact: it.href === '/student',
      section,
    }))
  })
}

// Phone bottom tab bar: one tab per group, landing on the group's first item.
// Copied from SchoolBottomNav on purpose (plan D7): the owner shell is not touched.
function StudentBottomNav({ lang }: { lang: Lang }) {
  const pathname = usePathname()
  const activeKey = studentGroupFor(pathname)?.group.key
  return (
    <nav
      aria-label={t('shell.bottomNav', lang)}
      className="border-t border-line/70 bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {STUDENT_NAV_GROUPS.map((group) => {
          const active = group.key === activeKey
          return (
            <li key={group.key} className="min-w-0 flex-1">
              <Link
                href={group.items[0].href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold ${FOCUS_RING} ${
                  active ? 'text-brand-600' : 'text-muted hover:text-brand-600'
                }`}
              >
                <Icon name={group.icon} className="size-5" />
                <span className="max-w-full truncate">{t(group.shortLabelKey, lang)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function StudentShell({
  fullName,
  schoolName,
  lang,
  initialCollapsed = false,
  children,
}: {
  fullName: string
  /** The Student's school; the app name stands in when it cannot be read. */
  schoolName: string | null
  lang: Lang
  initialCollapsed?: boolean
  children: React.ReactNode
}) {
  return (
    <AppShell
      brand={{ title: schoolName ?? t('app.name', lang), subtitle: t('home.student', lang), initial: schoolName ?? 'E' }}
      nav={buildStudentNav(lang)}
      profile={{ fullName, label: t('shell.profile', lang), href: '/student/profile' }}
      lang={lang}
      initialCollapsed={initialCollapsed}
      notificationsHref="/student/notifications"
      search={{
        label: t('student.search', lang),
        // Entries, not a renderer — see AppShellSearch. The dynamic record hits
        // still come from globalRecordSearch's `student` branch inside the palette.
        entries: STUDENT_SEARCH.map((e) => ({
          label: t(e.titleKey, lang),
          keywords: e.keywords,
          href: e.href,
          icon: (
            <StrokeIcon className="size-4">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </StrokeIcon>
          ),
        })),
      }}
      bottomNav={<StudentBottomNav lang={lang} />}
      // D8: flip to true once WP-C and WP-D have converted every page.
      contentContainer={false}
    >
      {children}
    </AppShell>
  )
}
