import { currentLang } from '@/lib/i18n-server'
import { RoleGroupShell } from '@/components/role-group-shell'
import { getDistributorContext } from '@/lib/distributor/context'
import { DISTRIBUTOR_LINKS } from '@/lib/distributor/nav'

// Persistent chrome for every /distributor/* page (#271). getDistributorContext
// re-verifies the distributor role server-side (cache()-shared with the page).
export default async function DistributorLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  await getDistributorContext()

  return (
    <RoleGroupShell lang={lang} links={DISTRIBUTOR_LINKS}>
      {children}
    </RoleGroupShell>
  )
}
