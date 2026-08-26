import { currentLang } from '@/lib/i18n-server'
import { sidebarCollapsed } from '@/lib/ui-prefs-server'
import { AppShell, type AppNavItem } from '@/components/app-shell'
import { StrokeIcon } from '@/components/stroke-icon'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'

// /student/* chrome (#441) — the shared AppShell (#285), same as every other
// role group. Nav starts with Home only; each later ticket on map #434 adds the
// one entry its own screen needs, so nothing is linked before it exists.
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const collapsed = await sidebarCollapsed()
  const { student } = await getStudentContext()

  const nav: AppNavItem[] = [
    {
      href: '/student',
      label: t('student.nav.home', lang),
      matchExact: true,
      icon: (
        <StrokeIcon className="size-5">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
        </StrokeIcon>
      ),
    },
    {
      href: '/student/routine',
      label: t('student.nav.routine', lang),
      icon: (
        <StrokeIcon className="size-5">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 10h18M8 2v4M16 2v4" />
        </StrokeIcon>
      ),
    },
    {
      href: '/student/notices',
      label: t('student.nav.notices', lang),
      icon: (
        <StrokeIcon className="size-5">
          <path d="M4 4h16v13H8l-4 4V4Z" />
          <path d="M8 9h8M8 13h5" />
        </StrokeIcon>
      ),
    },
    {
      href: '/student/tasks',
      label: t('student.nav.tasks', lang),
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
      brand={{ title: t('app.name', lang), subtitle: t('home.student', lang), initial: 'E' }}
      nav={nav}
      profile={{ fullName: student.full_name, label: t('shell.profile', lang) }}
      lang={lang}
      initialCollapsed={collapsed}
      contentContainer={false}
    >
      {children}
    </AppShell>
  )
}
