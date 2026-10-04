import type { MessageKey } from '@/lib/i18n'
import type { SectionTab } from '@/components/ui/section-tabs'

// Student portal menu: 5 groups = 5 phone tabs = 5 sidebar sections, the same
// shape as SCHOOL_NAV_GROUPS (lib/school-nav.ts). Pure data, no JSX: the icons
// are drawn by components/student-shell.tsx from `icon` names. Profile is not
// here; it lives in the avatar popover, notifications on the bell.

export type StudentNavGroupKey = 'overview' | 'study' | 'exams' | 'attendance' | 'money'
export type StudentNavItemKey =
  | 'home' | 'tasks' | 'routine' | 'materials' | 'questions'
  | 'exams' | 'results' | 'attendance' | 'leave' | 'fees' | 'notices'

export interface StudentNavItem {
  key: StudentNavItemKey
  href: string
  titleKey: MessageKey
}

export interface StudentNavGroup {
  key: StudentNavGroupKey
  /** Sidebar section heading. */
  labelKey: MessageKey
  /** Phone bottom tab label. */
  shortLabelKey: MessageKey
  /** Name of a glyph in components/school-icons.tsx (the tab icon). */
  icon: 'dashboard' | 'classes' | 'exams' | 'attendance' | 'fees'
  /** First item is the tab's landing page. */
  items: StudentNavItem[]
}

export const STUDENT_NAV_GROUPS: StudentNavGroup[] = [
  {
    key: 'overview',
    labelKey: 'student.navGroup.overview',
    shortLabelKey: 'student.nav.home',
    icon: 'dashboard',
    // Notices sit beside Home: read several times a week, and not a money matter.
    items: [
      { key: 'home', href: '/student', titleKey: 'student.nav.home' },
      { key: 'notices', href: '/student/notices', titleKey: 'student.nav.notices' },
    ],
  },
  {
    key: 'study',
    labelKey: 'student.navGroup.study',
    shortLabelKey: 'student.tab.study',
    icon: 'classes',
    items: [
      { key: 'tasks', href: '/student/tasks', titleKey: 'student.nav.tasks' },
      { key: 'routine', href: '/student/routine', titleKey: 'student.nav.routine' },
      { key: 'materials', href: '/student/materials', titleKey: 'student.nav.materials' },
      { key: 'questions', href: '/student/questions', titleKey: 'student.nav.questions' },
    ],
  },
  {
    key: 'exams',
    labelKey: 'student.navGroup.exams',
    shortLabelKey: 'student.tab.exams',
    icon: 'exams',
    items: [
      { key: 'exams', href: '/student/exams', titleKey: 'student.nav.exams' },
      { key: 'results', href: '/student/results', titleKey: 'student.nav.results' },
    ],
  },
  {
    key: 'attendance',
    labelKey: 'student.navGroup.attendance',
    shortLabelKey: 'student.tab.attendance',
    icon: 'attendance',
    items: [
      { key: 'attendance', href: '/student/attendance', titleKey: 'student.nav.attendance' },
      { key: 'leave', href: '/student/leave', titleKey: 'student.nav.leave' },
    ],
  },
  {
    key: 'money',
    labelKey: 'student.navGroup.money',
    shortLabelKey: 'student.tab.money',
    icon: 'fees',
    items: [{ key: 'fees', href: '/student/fees', titleKey: 'student.nav.fees' }],
  },
]

function matchLength(pathname: string, href: string): number {
  // Home matches only itself, or it would swallow every /student route.
  const hit = href === '/student' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
  return hit ? href.length : -1
}

/** The group and item a route belongs to (longest prefix wins), or null for
 *  routes outside the menu (profile, notifications). */
export function studentGroupFor(
  pathname: string,
): { group: StudentNavGroup; item: StudentNavItem } | null {
  let found: { group: StudentNavGroup; item: StudentNavItem } | null = null
  let best = -1
  for (const group of STUDENT_NAV_GROUPS) {
    for (const item of group.items) {
      const len = matchLength(pathname, item.href)
      if (len > best) {
        best = len
        found = { group, item }
      }
    }
  }
  return found
}

/** SectionTabs input for a group's pages. Zero or missing counts show no badge. */
export function studentGroupTabs(
  groupKey: StudentNavGroupKey,
  counts: Partial<Record<StudentNavItemKey, number>> = {},
): SectionTab[] {
  const group = STUDENT_NAV_GROUPS.find((g) => g.key === groupKey)
  if (!group) return []
  return group.items.map((it) => {
    const n = counts[it.key]
    return n ? { href: it.href, labelKey: it.titleKey, count: n } : { href: it.href, labelKey: it.titleKey }
  })
}
