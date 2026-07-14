import type { MessageKey } from '@/lib/i18n'
import type { ScreenKey } from '@/lib/auth/screens'

// Shared nav data for the School Owner/Staff sidebar (school-shell.tsx) and the
// dashboard's Quick Actions, per ui/school-owner/dashboard.html's sidebar.

export interface SchoolNavItem {
  screen: ScreenKey
  href: string
  titleKey: MessageKey
}

export const SCHOOL_MODULES: SchoolNavItem[] = [
  { screen: 'students', href: '/school/students', titleKey: 'students.title' },
  { screen: 'employees', href: '/school/employees', titleKey: 'employees.title' },
  { screen: 'attendance', href: '/school/attendance', titleKey: 'attendance.title' },
  { screen: 'classes', href: '/school/classes', titleKey: 'classes.title' },
  { screen: 'exams', href: '/school/exams', titleKey: 'exams.title' },
  { screen: 'fees', href: '/school/fees', titleKey: 'fees.title' },
  { screen: 'sms', href: '/school/sms', titleKey: 'sms.title' },
  { screen: 'notices', href: '/school/notices', titleKey: 'notices.title' },
  { screen: 'feedback', href: '/school/feedback', titleKey: 'feedback.title' },
  { screen: 'institute', href: '/school/institute', titleKey: 'institute.title' },
  { screen: 'staff', href: '/school/staff', titleKey: 'staff.title' },
]

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
