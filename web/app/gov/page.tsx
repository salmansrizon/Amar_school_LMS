import { RoleShell } from '@/components/role-shell'
import { TerritorySchools } from '@/components/territory-schools'
import { currentLang } from '@/lib/i18n-server'

export default async function GovHome() {
  const lang = await currentLang()
  return (
    <RoleShell group="/gov" titleKey="home.gov">
      <TerritorySchools lang={lang} />
    </RoleShell>
  )
}
