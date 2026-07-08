import { RoleShell } from '@/components/role-shell'
import { TerritorySchools } from '@/components/territory-schools'
import { currentLang } from '@/lib/i18n-server'

export default async function DealerHome() {
  const lang = await currentLang()
  return (
    <RoleShell group="/dealer" titleKey="home.dealer">
      <TerritorySchools lang={lang} />
    </RoleShell>
  )
}
