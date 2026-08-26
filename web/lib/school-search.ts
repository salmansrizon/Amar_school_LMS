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

// The Student portal's own destinations (#457). A separate list rather than
// entries on SCHOOL_SEARCH, because those are gated by canOpenScreen — a
// staff-permission concept a Student has no part in (#438). The student shell
// has a fixed nav, so every entry here is always reachable.
export interface StudentSearchEntry {
  href: string
  titleKey: MessageKey
  keywords: string[]
}

export const STUDENT_SEARCH: StudentSearchEntry[] = [
  { href: '/student', titleKey: 'student.nav.home', keywords: ['home', 'today', 'হোম', 'আজ'] },
  { href: '/student/routine', titleKey: 'student.routineTitle', keywords: ['routine', 'timetable', 'class', 'রুটিন', 'ক্লাস'] },
  { href: '/student/notices', titleKey: 'student.noticesTitle', keywords: ['notice', 'announcement', 'নোটিশ', 'বিজ্ঞপ্তি'] },
  { href: '/student/tasks', titleKey: 'student.tasksTitle', keywords: ['homework', 'task', 'due', 'বাড়ির কাজ', 'কাজ'] },
  { href: '/student/materials', titleKey: 'student.materialsTitle', keywords: ['syllabus', 'lesson', 'material', 'pdf', 'সিলেবাস', 'পড়ার উপকরণ'] },
  { href: '/student/results', titleKey: 'student.resultsTitle', keywords: ['result', 'marks', 'grade', 'gpa', 'ফলাফল', 'নম্বর'] },
  { href: '/student/exams', titleKey: 'student.examsTitle', keywords: ['exam', 'seat', 'admit card', 'পরীক্ষা', 'প্রবেশপত্র', 'আসন'] },
  { href: '/student/attendance', titleKey: 'student.attendanceTitle', keywords: ['attendance', 'present', 'absent', 'উপস্থিতি', 'হাজিরা'] },
  { href: '/student/leave', titleKey: 'student.leaveTitle', keywords: ['leave', 'holiday', 'absent', 'ছুটি'] },
  { href: '/student/fees', titleKey: 'student.feesTitle', keywords: ['fee', 'due', 'payment', 'ফি', 'বকেয়া', 'বেতন'] },
  { href: '/student/questions', titleKey: 'student.questionsTitle', keywords: ['question', 'ask', 'teacher', 'প্রশ্ন', 'শিক্ষক'] },
  { href: '/student/profile', titleKey: 'student.profileTitle', keywords: ['profile', 'correction', 'photo', 'তথ্য', 'সংশোধন'] },
]
