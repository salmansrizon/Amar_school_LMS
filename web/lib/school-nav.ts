import type { MessageKey } from '@/lib/i18n'
import type { ScreenKey } from '@/lib/auth/screens'

// Shared nav data for the School Owner/Staff sidebar (school-shell.tsx) and the
// dashboard's Quick Actions, per ui/school-owner/dashboard.html's sidebar.

export interface SchoolNavItem {
  screen: ScreenKey
  href: string
  titleKey: MessageKey
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
  { screen: 'feedback', href: '/school/feedback', titleKey: 'feedback.title' },
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
