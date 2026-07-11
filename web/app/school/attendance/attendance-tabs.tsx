import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'

const TABS = [
  { href: '/school/attendance/mark', key: 'attendance.tabMark' as const },
  { href: '/school/attendance/book', key: 'attendance.tabBook' as const },
  { href: '/school/attendance/employee', key: 'attendance.tabEmployee' as const },
  { href: '/school/attendance/leave', key: 'attendance.tabLeave' as const },
  { href: '/school/attendance/off-days', key: 'attendance.tabOffDays' as const },
  { href: '/school/attendance', key: 'attendance.tabCards' as const },
]

export function AttendanceTabs({ active, lang }: { active: string; lang: Lang }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-t-md px-3 py-2 text-sm font-semibold ${
            tab.href === active
              ? 'border-b-2 border-brand-500 text-brand-600'
              : 'text-muted hover:text-ink'
          }`}
        >
          {t(tab.key, lang)}
        </Link>
      ))}
    </div>
  )
}
