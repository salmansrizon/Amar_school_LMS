import { currentLang } from '@/lib/i18n-server'
import { sidebarCollapsed } from '@/lib/ui-prefs-server'
import { t } from '@/lib/i18n'
import { SchoolShell } from '@/components/school-shell'
import { getSchoolContext } from '@/lib/school/context'

// Persistent chrome for every /school/* page (sidebar + topbar per the reference
// image). Auth/profile/grants come from the per-request cached getSchoolContext()
// so this layout and the page it wraps share one set of queries (no duplication).
export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const collapsed = await sidebarCollapsed()
  const ctx = await getSchoolContext()

  return (
    <SchoolShell
      role={ctx.role}
      grants={ctx.grants}
      schoolName={ctx.schoolName ?? t('home.school', lang)}
      fullName={ctx.fullName}
      lang={lang}
      initialCollapsed={collapsed}
    >
      {children}
    </SchoolShell>
  )
}
