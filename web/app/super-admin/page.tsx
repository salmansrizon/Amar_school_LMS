import { RoleShell } from '@/components/role-shell'

export default function SuperAdminHome() {
  return (
    <RoleShell
      group="/super-admin"
      titleKey="home.superAdmin"
      links={[
        { href: '/super-admin/locations', labelKey: 'locations.title' },
        { href: '/super-admin/partners', labelKey: 'partners.title' },
        { href: '/super-admin/codes', labelKey: 'codes.title' },
        { href: '/super-admin/schools', labelKey: 'schools.title' },
      ]}
    />
  )
}
