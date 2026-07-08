import { RoleShell } from '@/components/role-shell'

export default function SuperAdminHome() {
  return (
    <RoleShell
      group="/super-admin"
      titleKey="home.superAdmin"
      links={[{ href: '/super-admin/locations', labelKey: 'locations.title' }]}
    />
  )
}
