import { currentLang } from '@/lib/i18n-server'
import { sidebarCollapsed, themePreference } from '@/lib/ui-prefs-server'
import { SuperAdminShell } from '@/components/super-admin-shell'
import { getSuperAdminContext } from '@/lib/super-admin/context'

// Persistent chrome for every /super-admin/* page (map #158 origin, modernised
// in map #171 T1): sidebar nav + topbar. getSuperAdminContext re-verifies the
// super_admin role server-side (the proxy gate is only optimistic) and, being
// cache()-wrapped, shares its auth lookup with the wrapped page. The sidebar
// collapse choice is read from its cookie before first paint (issue #115).
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const collapsed = await sidebarCollapsed()
  const theme = await themePreference()
  const { fullName } = await getSuperAdminContext()

  return (
    <SuperAdminShell fullName={fullName} lang={lang} theme={theme} initialCollapsed={collapsed}>
      {children}
    </SuperAdminShell>
  )
}
