import type { MessageKey } from '@/lib/i18n'
import type { ScreenKey } from '@/lib/auth/screens'
import { HUB_HOME } from '@/lib/student/hub'

// Shared nav data for the School Owner/Staff sidebar (school-shell.tsx) and the
// dashboard's Quick Actions, per ui/school-owner/dashboard.html's sidebar.

export interface SchoolNavItem {
  /** 'dashboard' is the always-available sentinel — an entry every school member
   *  can open, whose own contents gate themselves. See the Messages & Requests
   *  entry below for the only current use. */
  screen: ScreenKey | 'dashboard'
  href: string
  titleKey: MessageKey
  /** Sidebar glyph, when it should not be the one named by `screen` — the
   *  always-available sentinel has no glyph of its own. */
  icon?: string
  /** Nested entries shown under this one in the sidebar (issue #101). A child
   *  keeps its own screen grant and its own route — nesting is presentation. */
  children?: SchoolNavItem[]
}

export const SCHOOL_MODULES: SchoolNavItem[] = [
  { screen: 'students', href: '/school/students', titleKey: 'students.title' },
  { screen: 'employees', href: '/school/employees', titleKey: 'employees.title' },
  {
    screen: 'classes',
    href: '/school/classes',
    titleKey: 'classes.title',
    // Attendance depends on class information (docs/improvement.md Known
    // Issues §1), so it reads as a child of Class & Curriculum. Nav position
    // only (map #91 grilling decision 11): the route stays /school/attendance,
    // and the `attendance` grant key is untouched.
    children: [{ screen: 'attendance', href: '/school/attendance', titleKey: 'attendance.title' }],
  },
  { screen: 'exams', href: '/school/exams', titleKey: 'exams.title' },
  { screen: 'fees', href: '/school/fees', titleKey: 'fees.title' },
  { screen: 'sms', href: '/school/sms', titleKey: 'sms.title' },
  { screen: 'notices', href: '/school/notices', titleKey: 'notices.title' },
  // GUARDIAN FEEDBACK IS HIDDEN (#510), not removed. Its routes, tables, the
  // `feedback` grant key, the `feedback` feature key and all its i18n are
  // untouched — this is a nav decision and a temporary one ("not workable for
  // now"), so it must read as a one-line reversal. The other half of the same
  // reversal is the commented entry in lib/school-search.ts: leaving the search
  // shortcut behind would be worse than leaving the nav item, because whoever
  // found the feature that way would have no way to know it is meant to be gone.
  //
  //   { screen: 'feedback', href: '/school/feedback', titleKey: 'feedback.title' },
  //
  // বার্তা ও অনুরোধ / Messages & Requests (#509). One entry where there were
  // three — questions, corrections and the response report — because a Class
  // Teacher reads none of those three labels as "the students are waiting on
  // you". It takes over the Feedback slot; guardian feedback is hidden (#510).
  //
  // `screen: 'dashboard'` is the always-available sentinel, NOT a grant. The
  // section deliberately rides no screen key and no feature key: `feedback` is
  // both, and riding it would take student questions down with guardian feedback
  // whenever a school switched that feature off (ADR 0018). What a caller
  // actually sees inside is decided by class attachment, in RLS (0152) — so an
  // office staff member reaching this nav item finds an empty section that says
  // why, which is the designed outcome rather than a leak.
  { screen: 'dashboard', href: HUB_HOME, titleKey: 'hub.title', icon: 'feedback' },
  { screen: 'institute', href: '/school/institute', titleKey: 'institute.title' },
  { screen: 'staff', href: '/school/staff', titleKey: 'staff.title' },
]

/** Every nav entry, parents and children alike — for anything that needs the
 *  flat module list rather than the sidebar's shape. */
export function flattenSchoolModules(items: SchoolNavItem[] = SCHOOL_MODULES): SchoolNavItem[] {
  return items.flatMap((item) => [item, ...(item.children ?? [])])
}

export interface SchoolQuickAction {
  screen: ScreenKey
  href: string
  labelKey: MessageKey
  primary?: boolean
}

export const SCHOOL_QUICK_ACTIONS: SchoolQuickAction[] = [
  { screen: 'students', href: '/school/students/new', labelKey: 'dash.qaNewAdmission', primary: true },
  { screen: 'employees', href: '/school/employees/new', labelKey: 'dash.qaNewEmployee' },
  { screen: 'attendance', href: '/school/attendance', labelKey: 'dash.qaMarkAttendance' },
  { screen: 'fees', href: '/school/fees', labelKey: 'dash.qaCollectFee' },
  { screen: 'notices', href: '/school/notices/new', labelKey: 'dash.qaNewNotice' },
]
