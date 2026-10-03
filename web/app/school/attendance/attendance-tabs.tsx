import type { ReactNode } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { SegmentedControl } from '@/components/ui/segmented-control'
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


export function AttendanceTabs({
  active,
  lang,
  extra,
}: {
  active: string
  lang: Lang
  /** A calendar page's own toolbar (month nav + Today + view switch) — shares
   *  this component's second row, at the right, beside the sub-nav (calendar
   *  polish, map 013 follow-up: one toolbar row replaces what used to be a
   *  second underline tab row plus a third Calendar/Table row). */
  extra?: ReactNode
}) {
  const activeGroup = GROUPS.find((g) => (g.tabs ? g.tabs.some((tab) => tab.href === active) : g.href === active))
  const subItems = activeGroup?.tabs?.map((tab) => ({ href: tab.href, label: t(tab.key, lang) }))
  if (!subItems && !extra) return null

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        {subItems && <SegmentedControl items={subItems} active={active} ariaLabel={t('attendance.subNavLabel', lang)} />}
      </div>
      {extra}
    </div>
  )
}
