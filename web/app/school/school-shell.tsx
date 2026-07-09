'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LangSwitch } from '@/components/lang-switch'
import { LogoutButton } from '@/components/logout-button'
import { t, type MessageKey } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'

interface NavItem {
  href: string
  labelKey: MessageKey
  ownerOnly?: boolean
}

// Mirrors the GitHub Pages mockup sidebar (ui/school-owner). Only routes that
// exist today are listed; later tickets add Publishing/Feedback/Institute Setup.
const NAV: NavItem[] = [
  { href: '/school', labelKey: 'dash.title' },
  { href: '/school/students', labelKey: 'students.title' },
  { href: '/school/employees', labelKey: 'employees.title' },
  { href: '/school/attendance', labelKey: 'attendance.title' },
  { href: '/school/classes', labelKey: 'classes.title' },
  { href: '/school/classes/routine', labelKey: 'routine.title' },
  { href: '/school/classes/syllabus', labelKey: 'syllabus.title' },
  { href: '/school/exams', labelKey: 'exams.title' },
  { href: '/school/fees', labelKey: 'fees.title' },
  { href: '/school/sms', labelKey: 'sms.title' },
  { href: '/school/staff', labelKey: 'staff.title', ownerOnly: true },
]

/** The nav item whose href is the longest prefix of the current path wins, so
 *  /school/classes/routine highlights Routine, not Class & Curriculum. */
function activeHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null
  for (const it of items) {
    const match = pathname === it.href || pathname.startsWith(it.href + '/')
    if (match && (best === null || it.href.length > best.length)) best = it.href
  }
  return best
}

export function SchoolShell({
  role,
  children,
}: {
  role: 'school_owner' | 'staff_user'
  children: React.ReactNode
}) {
  const lang = useLang()
  const pathname = usePathname()
  const items = NAV.filter((n) => !n.ownerOnly || role === 'school_owner')
  const active = activeHref(pathname, items)

  const linkCls = (href: string, base: string, on: string, off: string) =>
    `${base} ${href === active ? on : off}`

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-ink text-white md:flex">
        <div className="flex items-center gap-2 px-5 py-4 font-extrabold">
          <span className="flex size-7 items-center justify-center rounded-sm bg-brand-500 text-sm font-bold">A</span>
          {t('app.name', lang)}
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={linkCls(
                n.href,
                'rounded-md px-3 py-2 text-sm',
                'bg-brand-500 font-semibold text-white',
                'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              {t(n.labelKey, lang)}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex size-7 items-center justify-center rounded-sm bg-brand-500 text-sm font-bold text-white">A</span>
            <span className="font-extrabold">{t('app.name', lang)}</span>
          </div>
          <div className="text-lg font-bold max-md:hidden">
            {active ? t(items.find((i) => i.href === active)!.labelKey, lang) : t('home.school', lang)}
          </div>
          <div className="flex items-center gap-3">
            <LangSwitch lang={lang} />
            <LogoutButton label={t('shell.logout', lang)} />
          </div>
        </header>

        {/* Mobile horizontal nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-paper px-3 py-2 md:hidden">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={linkCls(
                n.href,
                'whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold',
                'bg-brand-500 text-white',
                'border border-line-strong text-ink hover:bg-paper-muted',
              )}
            >
              {t(n.labelKey, lang)}
            </Link>
          ))}
        </nav>

        <div className="flex-1 bg-paper-muted">{children}</div>
      </div>
    </div>
  )
}
