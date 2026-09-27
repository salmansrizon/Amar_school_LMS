import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'
import { ATTENDANCE_GROUPS as GROUPS, attendanceGroupHref } from '@/lib/attendance-nav'

// RFID card assignment tab intentionally removed — RFID is disabled for now, so
// attendance is manual only (mark/book/employee/leave/off-days).
//
// Two-level nav (map #663): Students and Employees are parent groups whose
// sub-tabs render below the parent row; Off-Days Calendar has no sub-tabs and
// stays shared/common. This is a routing/UI grouping only — every href below
// is unchanged from the old flat tab bar, and `attendance` remains a single
// Permission Grant (web/lib/auth/screens.ts) regardless of grouping.
//
// The group/tab data itself lives in lib/attendance-nav.ts (map #667), so the
// sidebar (lib/school-nav.ts) can read each group's default route without a
// lib -> app import.

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
            href={attendanceGroupHref(group.id)}
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
