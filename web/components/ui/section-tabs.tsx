import Link from 'next/link'
import { t, type Lang, type MessageKey } from '@/lib/i18n'

// One tab bar for a section whose tabs are real routes.
//
// There were already three near-identical copies of this markup —
// `app/school/institute/tabs.tsx`, `app/school/attendance/attendance-tabs.tsx`
// and feedback's inline `<nav>`. Badges are what finally give the fourth a
// reason to be canonical rather than a fourth copy. Institute and Attendance
// have no badges and no reason to change today, so migrating them is a later
// mechanical follow-up and deliberately not part of #509.
//
// NOT `components/ui/tabs.tsx`: that is Base UI Tabs, which switches panels
// inside one page. Using it here would mean shipping client JS to render three
// links, and losing the per-tab URL that makes ⌘K able to land on one (#510).

export interface SectionTab {
  href: string
  labelKey: MessageKey
  /** Omit, or pass null, for no badge. Zero is not a badge — see `badgeCount`. */
  count?: number | null
}

export function SectionTabs({
  tabs,
  active,
  lang,
  label,
}: {
  tabs: readonly SectionTab[]
  /** The href of the current tab. */
  active: string
  lang: Lang
  /** Accessible name for the nav landmark — the section's own title. */
  label: string
}) {
  return (
    <nav
      aria-label={label}
      className="mb-section flex flex-nowrap gap-1 overflow-x-auto border-b border-line text-sm font-semibold"
    >
      {tabs.map((tab) => {
        const current = tab.href === active
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md px-4 py-2 ${
              current
                ? 'border-b-2 border-brand-500 text-brand-600'
                : 'text-muted hover:bg-paper hover:text-ink'
            }`}
          >
            {t(tab.labelKey, lang)}
            {tab.count ? (
              // The count is decoration over a label that already says what it
              // counts, so it needs no separate accessible text beyond its own.
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                  current ? 'bg-brand-50 text-brand-600' : 'bg-paper-muted text-muted'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
