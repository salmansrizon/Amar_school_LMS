import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'

// Shared tab bar per notices-list.html / notice-create.html / gallery-albums.html
// (all three pages sit under one "Publishing" section with a common tab strip).
export function NoticeTabs({ active, lang }: { active: 'list' | 'create' | 'gallery'; lang: Lang }) {
  const tabs = [
    { key: 'list', href: '/school/notices', label: t('notices.tabList', lang) },
    { key: 'create', href: '/school/notices/new', label: t('notices.tabCreate', lang) },
    { key: 'gallery', href: '/school/notices/gallery', label: t('notices.tabGallery', lang) },
  ] as const

  return (
    <nav className="mb-5 flex flex-nowrap gap-1 overflow-x-auto border-b border-line text-sm font-semibold">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={
            active === tab.key
              ? 'shrink-0 whitespace-nowrap rounded-t-md border-b-2 border-brand-500 px-4 py-2 text-brand-600'
              : 'shrink-0 whitespace-nowrap rounded-t-md px-4 py-2 text-muted hover:bg-paper hover:text-ink'
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
