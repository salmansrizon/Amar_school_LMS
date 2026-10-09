import type { ReactNode } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SectionTabs } from '@/components/ui/section-tabs'
import { attendanceGroupHref } from '@/lib/attendance-nav'
import { attendanceGroupsFor, isEmployeeAttendanceAdmin } from '@/lib/school/employee-attendance-admin'

// RFID card assignment tab intentionally removed — RFID is disabled for now, so
// attendance is manual only (mark/book/employee/leave/off-days).
//
// Two levels, both in the page (owner decision 2026-10-06; the sidebar now
// holds one Attendance item, like Exams):
//  1. the area row — Students, Employees, Off-Day Calendar, Machine — as the
//     shared underlined SectionTabs strip (page-to-page links in a <nav>, with
//     aria-current, not ARIA tabs);
//  2. the chosen area's own pages as the compact SegmentedControl, sharing its
//     row with a calendar page's toolbar (`extra`).
// The two look different on purpose: two identical tab rows stacked read as one
// confusing control. Off-Day Calendar has no pages of its own, so it shows
// only the area row.
//
// The group/tab data lives in lib/attendance-nav.ts.
//
// #677: a teacher (a Staff User with an employees row) does not get the
// Employees and Machine areas; the pages refuse her too. Async server component
// so no page has to pass the answer in.

export async function AttendanceTabs({
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
  const GROUPS = attendanceGroupsFor(await isEmployeeAttendanceAdmin())
  const activeGroup = GROUPS.find((g) => (g.tabs ? g.tabs.some((tab) => tab.href === active) : g.href === active))
  const subItems = activeGroup?.tabs?.map((tab) => ({ href: tab.href, label: t(tab.key, lang) }))
  const areas = GROUPS.map((g) => ({ href: attendanceGroupHref(g.id), labelKey: g.labelKey }))

  return (
    <>
      <SectionTabs
        tabs={areas}
        active={activeGroup ? attendanceGroupHref(activeGroup.id) : ''}
        lang={lang}
        label={t('attendance.title', lang)}
      />
      {(subItems || extra) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 max-w-full max-sm:w-full">
            {subItems && (
              <SegmentedControl items={subItems} active={active} ariaLabel={t('attendance.subNavLabel', lang)} />
            )}
          </div>
          {extra}
        </div>
      )}
    </>
  )
}
