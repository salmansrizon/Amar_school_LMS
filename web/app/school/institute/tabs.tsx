import Link from 'next/link'
import { t, type Lang, type MessageKey } from '@/lib/i18n'

// Shared tab bar per the mockups (institute-profile.html, activity-checklist.html,
// logistics-index.html, blank-templates.html) — real routes, not anchors, since
// each tab has its own data/forms (unlike the single-page classes anchors).
const TABS: { href: string; key: MessageKey }[] = [
  { href: '/school/institute', key: 'institute.tabProfile' },
  { href: '/school/institute/checklist', key: 'institute.tabChecklist' },
  { href: '/school/institute/logistics', key: 'institute.tabLogistics' },
  { href: '/school/institute/templates', key: 'institute.tabTemplates' },
]

export function InstituteTabs({ active, lang }: { active: string; lang: Lang }) {
  return (
    <nav className="mb-5 flex gap-1 border-b border-line text-sm font-semibold">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-t-md px-4 py-2 ${
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
