import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'

// RFID card assignment tab intentionally removed — RFID is disabled for now, so
// attendance is manual only (mark/book/employee/leave/off-days).
//
// Two-level nav (map #663): Students and Employees are parent groups whose
// sub-tabs render below the parent row; Off-Days Calendar has no sub-tabs and
// stays shared/common. This is a routing/UI grouping only — every href below
// is unchanged from the old flat tab bar, and `attendance` remains a single
// Permission Grant (web/lib/auth/screens.ts) regardless of grouping.
const STUDENT_TABS = [
  { href: '/school/attendance/mark', key: 'attendance.tabMark' as const },
  { href: '/school/attendance/book', key: 'attendance.tabBook' as const },
  { href: '/school/attendance/student-log', key: 'attendance.tabStudentLog' as const },
  { href: '/school/attendance/leave', key: 'attendance.tabLeave' as const },
]

// Leave Management is still one unified page/route (split lands in #664), so
// its Employees-group entry carries a `group` query param purely to
// disambiguate which parent row highlights as active — it is never read for
// filtering, only threaded through to the `active` prop below.
const EMPLOYEE_TABS = [
  { href: '/school/attendance/employee', key: 'attendance.tabEmployee' as const },
  { href: '/school/attendance/leave?group=employees', key: 'attendance.tabLeave' as const },
]

const GROUPS = [
  { id: 'students', labelKey: 'attendance.groupStudents' as const, tabs: STUDENT_TABS },
  { id: 'employees', labelKey: 'attendance.groupEmployees' as const, tabs: EMPLOYEE_TABS },
  { id: 'off-days', labelKey: 'attendance.tabOffDays' as const, tabs: null, href: '/school/attendance/off-days' },
]

function tabClass(isActive: boolean) {
  return `shrink-0 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-semibold ${
    isActive ? 'border-b-2 border-brand-500 text-brand-600' : 'text-muted hover:text-ink'
  }`
}

export function AttendanceTabs({ active, lang }: { active: string; lang: Lang }) {
  const activeGroup = GROUPS.find((g) => (g.tabs ? g.tabs.some((tab) => tab.href === active) : g.href === active))

  return (
    <div className="mb-4">
      <div className="flex flex-nowrap gap-1 overflow-x-auto border-b border-line">
        {GROUPS.map((group) => (
          <Link
            key={group.id}
            href={group.tabs ? group.tabs[0].href : group.href}
            className={tabClass(group.id === activeGroup?.id)}
          >
            {t(group.labelKey, lang)}
          </Link>
        ))}
      </div>
      {activeGroup?.tabs && (
        <div className="flex flex-nowrap gap-1 overflow-x-auto border-b border-line pl-2">
          {activeGroup.tabs.map((tab) => (
            <Link key={tab.href} href={tab.href} className={tabClass(tab.href === active)}>
              {t(tab.key, lang)}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
