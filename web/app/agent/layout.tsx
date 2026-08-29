import { currentLang } from '@/lib/i18n-server'
import { sidebarCollapsed } from '@/lib/ui-prefs-server'
import { AppShell, type AppNavItem } from '@/components/app-shell'
import { StrokeIcon } from '@/components/stroke-icon'
import { t } from '@/lib/i18n'
import { getAgentContext } from '@/lib/agent/context'

// /agent/* chrome — the shared AppShell (#285). contentContainer is false because
// each agent page renders its own <main>. Search + notifications per-role: #286/#287.
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const collapsed = await sidebarCollapsed()
  const { fullName } = await getAgentContext()

  const nav: AppNavItem[] = [
    {
      href: '/agent',
      label: t('agent.nav.dashboard', lang),
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
      href: '/agent/tasks',
      label: t('agent.nav.tasks', lang),
      icon: (
        <StrokeIcon className="size-5">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </StrokeIcon>
      ),
    },
  ]

  return (
    <AppShell
      brand={{ title: t('app.name', lang), subtitle: t('home.agent', lang), initial: 'E' }}
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
