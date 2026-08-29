import { currentLang } from '@/lib/i18n-server'
import { sidebarCollapsed } from '@/lib/ui-prefs-server'
import { AppShell, type AppNavItem } from '@/components/app-shell'
import { StrokeIcon } from '@/components/stroke-icon'
import { t } from '@/lib/i18n'
import { getGovContext } from '@/lib/gov/context'

// /gov/* chrome — the shared AppShell (#285). Gov had no shell before; it now
// joins the unified webframe. contentContainer is false (the page owns its <main>).
// Its search + notification sources land in #286 / #287; deeper gov surface in #298.
export default async function GovLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const collapsed = await sidebarCollapsed()
  const { fullName } = await getGovContext()

  const nav: AppNavItem[] = [
    {
      href: '/gov',
      label: t('gov.nav.dashboard', lang),
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
  ]

  return (
    <AppShell
      brand={{ title: t('app.name', lang), subtitle: t('home.gov', lang), initial: 'E' }}
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
