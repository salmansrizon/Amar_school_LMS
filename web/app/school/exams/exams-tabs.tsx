import Link from 'next/link'
import { t, type Lang, type MessageKey } from '@/lib/i18n'

// Shared Exams & Results sub-nav, matching the tab strip every other module uses
// (Accounting/Attendance/SMS/Institute/Notices): one horizontally-scrollable row
// with an active-state underline. Replaces the inline header links the exams
// pages used before.
const TABS: { href: string; key: MessageKey }[] = [
  { href: '/school/exams', key: 'exams.title' },
  { href: '/school/exams/grading-schemes', key: 'grading.title' },
  { href: '/school/exams/combinations', key: 'combinations.title' },
  { href: '/school/exams/cocurricular-items', key: 'cocurricular.itemsTitle' },
  { href: '/school/exams/mark-sheet-preview', key: 'markSheet.title' },
  { href: '/school/exams/result-inquiry', key: 'resultInquiry.title' },
]

export function ExamsTabs({ active, lang }: { active: string; lang: Lang }) {
  return (
    <nav className="mb-5 flex flex-nowrap gap-1 overflow-x-auto border-b border-line text-sm font-semibold">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`shrink-0 whitespace-nowrap rounded-t-md px-4 py-2 ${
            tab.href === active
              ? 'border-b-2 border-brand-500 text-brand-600'
              : 'text-muted hover:bg-paper hover:text-ink'
          }`}
        >
          {t(tab.key, lang)}
        </Link>
      ))}
    </nav>
  )
}
