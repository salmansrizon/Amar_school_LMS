import { currentLang } from '@/lib/i18n-server'
import { sidebarCollapsed } from '@/lib/ui-prefs-server'
import { AppShell, type AppNavItem } from '@/components/app-shell'
import { StrokeIcon } from '@/components/stroke-icon'
import { t } from '@/lib/i18n'
import { getDistributorContext } from '@/lib/distributor/context'

// /distributor/* chrome — the shared AppShell (#285). contentContainer is false
// because each distributor page renders its own <main>. Search + notifications
// arrive per-role in #286 / #287.
export default async function DistributorLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const collapsed = await sidebarCollapsed()
  const { fullName } = await getDistributorContext()

  const nav: AppNavItem[] = [
    {
      href: '/distributor',
      label: t('dist.nav.dashboard', lang),
      matchExact: true,
      icon: (
        <StrokeIcon className="size-5">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </StrokeIcon>
      ),
    },
    {
      href: '/distributor/crm',
      label: t('dist.nav.crm', lang),
      icon: (
        <StrokeIcon className="size-5">
          <path d="M3 12h4l2 5 4-14 2 7h6" />
        </StrokeIcon>
      ),
    },
    {
      href: '/distributor/onboarding',
      label: t('dist.nav.onboarding', lang),
      icon: (
        <StrokeIcon className="size-5">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </StrokeIcon>
      ),
    },
    {
      href: '/distributor/wallet',
      label: t('dist.nav.wallet', lang),
      icon: (
        <StrokeIcon className="size-5">
          <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M16 12h.01M3 9h18" />
        </StrokeIcon>
      ),
    },
    {
      href: '/distributor/invoices',
      label: t('dist.nav.invoices', lang),
      icon: (
        <StrokeIcon className="size-5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h4" />
        </StrokeIcon>
      ),
    },
  ]

  return (
    <AppShell
      brand={{ title: t('app.name', lang), subtitle: t('home.distributor', lang), initial: 'E' }}
      nav={nav}
      profile={{ fullName, label: t('shell.profile', lang) }}
      lang={lang}
      initialCollapsed={collapsed}
      contentContainer={false}
    >
      {children}
    </AppShell>
  )
}
