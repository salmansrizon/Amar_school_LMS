import { currentLang } from '@/lib/i18n-server'
import { SuperAdminShell } from '@/components/super-admin-shell'
import { getSuperAdminContext } from '@/lib/super-admin/context'

// Persistent chrome for every /super-admin/* page (map #158, ticket #160):
// sidebar nav + topbar. getSuperAdminContext re-verifies the super_admin role
// server-side (the proxy gate is only optimistic) and, being cache()-wrapped,
// shares its auth lookup with the wrapped page.
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const { fullName } = await getSuperAdminContext()

  return (
    <SuperAdminShell fullName={fullName} lang={lang}>
      {children}
    </SuperAdminShell>
  )
}
