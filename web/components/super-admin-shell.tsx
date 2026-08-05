'use client'

import { AppShell, type AppNavItem } from '@/components/app-shell'
import { StrokeIcon } from '@/components/stroke-icon'
import { t, type Lang, type MessageKey } from '@/lib/i18n'

// Super-admin chrome. Now a thin adapter over the shared AppShell (#285): it owns
// only the super-admin nav config (labels + inline icons); the sidebar, topbar,
// drawer, collapse and print behaviour all live in AppShell. contentContainer is
// false because every /super-admin/* page renders its own <main class max-w-* p-6>.
// Search + notifications arrive per-role in #286 / #287.

// Lucide-style inline icons (no icon dep in web/), 24x24 stroke=currentColor.
const Icons = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  school: (
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5" />
    </>
  ),
  distributor: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  codes: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <path d="M14 3h7v7M3 14h7v7" />
    </>
  ),
  gov: (
    <>
      <path d="M3 21h18M4 21V10l8-5 8 5v11M9 21v-6h6v6" />
    </>
  ),
  territory: (
    <>
      <path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  clusters: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M7.5 8 11 15.5M16.5 8 13 15.5" />
    </>
  ),
  sms: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  offDays: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  auditLog: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </>
  ),
  roles: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m17 11 2 2 4-4" />
    </>
  ),
  modules: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  subscription: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  coupon: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M9 8v8" />
    </>
  ),
  settlement: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  ledger: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 16l4-4 3 3 5-6" />
    </>
  ),
  monitor: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4M6 10l3 3 3-4 3 2" />
    </>
  ),
  flow: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <path d="M6 9v3a3 3 0 0 0 3 3h6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  invoice: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </>
  ),
} as const

const NAV: { href: string; labelKey: MessageKey; icon: React.ReactNode }[] = [
  { href: '/super-admin', labelKey: 'sa.nav.dashboard', icon: Icons.dashboard },
  { href: '/super-admin/schools', labelKey: 'sa.nav.schools', icon: Icons.school },
  { href: '/super-admin/partners', labelKey: 'sa.nav.distributors', icon: Icons.distributor },
  { href: '/super-admin/agreements', labelKey: 'sa.nav.agreements', icon: Icons.auditLog },
  { href: '/super-admin/codes', labelKey: 'sa.nav.codes', icon: Icons.codes },
  { href: '/super-admin/gov-officials', labelKey: 'sa.nav.gov', icon: Icons.gov },
  { href: '/super-admin/agents', labelKey: 'sa.nav.agents', icon: Icons.roles },
  { href: '/super-admin/locations', labelKey: 'sa.nav.territory', icon: Icons.territory },
  { href: '/super-admin/clusters', labelKey: 'sa.nav.clusters', icon: Icons.clusters },
  { href: '/super-admin/sms', labelKey: 'sa.nav.sms', icon: Icons.sms },
  { href: '/super-admin/off-days', labelKey: 'sa.nav.offDays', icon: Icons.offDays },
  { href: '/super-admin/subscription-config', labelKey: 'sa.nav.subscriptionConfig', icon: Icons.subscription },
  { href: '/super-admin/module-config', labelKey: 'sa.nav.moduleConfig', icon: Icons.modules },
  { href: '/super-admin/coupons', labelKey: 'sa.nav.coupons', icon: Icons.coupon },
  { href: '/super-admin/settlements', labelKey: 'sa.nav.settlements', icon: Icons.settlement },
  { href: '/super-admin/accounting', labelKey: 'sa.nav.accounting', icon: Icons.ledger },
  { href: '/super-admin/role-permissions', labelKey: 'sa.nav.rolePermissions', icon: Icons.roles },
  { href: '/super-admin/audit-log', labelKey: 'sa.nav.auditLog', icon: Icons.auditLog },
  { href: '/super-admin/attendance-job-monitor', labelKey: 'sa.nav.jobMonitor', icon: Icons.monitor },
  { href: '/super-admin/workflows', labelKey: 'sa.nav.workflows', icon: Icons.flow },
  { href: '/super-admin/notifications', labelKey: 'sa.nav.notifications', icon: Icons.bell },
  { href: '/super-admin/sms-commerce', labelKey: 'sa.nav.smsCommerce', icon: Icons.sms },
  { href: '/super-admin/invoices', labelKey: 'sa.nav.invoices', icon: Icons.invoice },
]

export function SuperAdminShell({
  fullName,
  lang,
  initialCollapsed = false,
  children,
}: {
  fullName: string
  lang: Lang
  initialCollapsed?: boolean
  children: React.ReactNode
}) {
  const nav: AppNavItem[] = NAV.map((item) => ({
    href: item.href,
    label: t(item.labelKey, lang),
    icon: <StrokeIcon className="size-5">{item.icon}</StrokeIcon>,
    matchExact: item.href === '/super-admin',
  }))

  return (
    <AppShell
      brand={{ title: t('app.name', lang), subtitle: t('sa.title', lang), initial: 'E' }}
      nav={nav}
      profile={{ fullName, label: t('shell.profile', lang) }}
      lang={lang}
      initialCollapsed={initialCollapsed}
      contentContainer={false}
    >
      {children}
    </AppShell>
  )
}
