import type { MessageKey } from './i18n'
import type { ScreenKey } from './auth/screens'

// Searchable feature index for the global-search command palette. Each entry is a
// place in the app the user can jump straight to. `keywords` (English + Bangla
// synonyms) broaden matching beyond the visible title. Gating is by `screen`
// (canOpenScreen); 'dashboard' is always available.

export interface SearchEntry {
  screen: ScreenKey | 'dashboard'
  href: string
  titleKey: MessageKey
  keywords: string[]
}

export const SCHOOL_SEARCH: SearchEntry[] = [
  { screen: 'dashboard', href: '/school', titleKey: 'dash.dashboard', keywords: ['home', 'overview', 'হোম', 'ড্যাশবোর্ড'] },
  { screen: 'students', href: '/school/students', titleKey: 'students.title', keywords: ['student', 'pupil', 'শিক্ষার্থী', 'ছাত্র'] },
  { screen: 'students', href: '/school/students/new', titleKey: 'dash.qaNewAdmission', keywords: ['admission', 'enroll', 'new student', 'ভর্তি', 'নতুন'] },
  { screen: 'employees', href: '/school/employees', titleKey: 'employees.title', keywords: ['staff', 'teacher', 'কর্মচারী', 'শিক্ষক'] },
  { screen: 'employees', href: '/school/employees/new', titleKey: 'dash.qaNewEmployee', keywords: ['new employee', 'hire', 'নতুন কর্মচারী'] },
  { screen: 'attendance', href: '/school/attendance', titleKey: 'attendance.title', keywords: ['attendance', 'present', 'absent', 'উপস্থিতি', 'হাজিরা'] },
  { screen: 'classes', href: '/school/classes', titleKey: 'classes.title', keywords: ['class', 'curriculum', 'subject', 'routine', 'শ্রেণি', 'পাঠ্যক্রম'] },
  { screen: 'exams', href: '/school/exams', titleKey: 'exams.title', keywords: ['exam', 'result', 'marks', 'grade', 'পরীক্ষা', 'ফলাফল'] },
  { screen: 'fees', href: '/school/fees', titleKey: 'fees.title', keywords: ['fee', 'accounting', 'payment', 'collect', 'ফি', 'হিসাব', 'বেতন'] },
  { screen: 'sms', href: '/school/sms', titleKey: 'sms.title', keywords: ['sms', 'message', 'notify', 'এসএমএস', 'বার্তা'] },
  { screen: 'notices', href: '/school/notices', titleKey: 'notices.title', keywords: ['notice', 'publish', 'gallery', 'নোটিশ', 'প্রকাশনা'] },
  { screen: 'notices', href: '/school/notices/new', titleKey: 'dash.qaNewNotice', keywords: ['new notice', 'announcement', 'নতুন নোটিশ'] },
  { screen: 'feedback', href: '/school/feedback', titleKey: 'feedback.title', keywords: ['feedback', 'rating', 'inbox', 'মতামত'] },
  { screen: 'institute', href: '/school/institute', titleKey: 'institute.title', keywords: ['institute', 'setup', 'profile', 'settings', 'প্রতিষ্ঠান', 'সেটআপ'] },
  { screen: 'staff', href: '/school/staff', titleKey: 'staff.title', keywords: ['permission', 'access', 'role', 'অনুমতি', 'স্টাফ'] },
]
