import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'
import { ATTENDANCE_GROUPS as GROUPS } from '@/lib/attendance-nav'

// RFID card assignment tab intentionally removed — RFID is disabled for now, so
// attendance is manual only (mark/book/employee/leave/off-days).
//
// Two-level nav (map #663) collapsed to one (map #670): Students and
// Employees were parent groups with a top-of-page group-selector row above
// their sub-tabs, but that row duplicated the sidebar entries #667 already
// added (Off-Day Calendar/Students/Employees, always-visible under
// Attendance) — removed here rather than left as a second way to reach the
// same three destinations. Only the second-level sub-tab row remains; a page
// whose group has no sub-tabs (Off-Day Calendar) renders no tab bar at all,
// since the sidebar already shows it as the active entry.
//
// The group/tab data itself still lives in lib/attendance-nav.ts (map #667),
// shared with the sidebar so the two can't drift apart.

function tabClass(isActive: boolean) {
  return `shrink-0 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-semibold ${
    isActive ? 'border-b-2 border-brand-500 text-brand-600' : 'text-muted hover:text-ink'
  }`
}

export function AttendanceTabs({ active, lang }: { active: string; lang: Lang }) {
  const activeGroup = GROUPS.find((g) => (g.tabs ? g.tabs.some((tab) => tab.href === active) : g.href === active))
  if (!activeGroup?.tabs) return null

  return (
    <div className="mb-4 flex flex-nowrap gap-1 overflow-x-auto border-b border-line">
      {activeGroup.tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={tabClass(tab.href === active)}>
          {t(tab.key, lang)}
        </Link>
      ))}
    </div>
  )
}
