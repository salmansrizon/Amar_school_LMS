import Link from 'next/link'
import { t, type Lang, type MessageKey } from '@/lib/i18n'

// Shared tab bar per the mockups (sms-compose.html, sms-absence-rules.html,
// sms-log.html) — real routes, matching the InstituteTabs precedent
// (app/school/institute/tabs.tsx), since each tab owns its own data/forms.
const TABS: { href: string; key: MessageKey }[] = [
  { href: '/school/sms', key: 'sms.tabCompose' },
  { href: '/school/sms/rules', key: 'sms.tabRules' },
  { href: '/school/sms/log', key: 'sms.tabLog' },
]

export function SmsTabs({ active, lang }: { active: string; lang: Lang }) {
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
