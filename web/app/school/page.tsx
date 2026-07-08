import { RoleShell } from '@/components/role-shell'

export default function SchoolHome() {
  return (
    <RoleShell
      group="/school"
      titleKey="home.school"
      links={[{ href: '/school/students', labelKey: 'students.title' }]}
      ownerLinks={[{ href: '/school/staff', labelKey: 'staff.title' }]}
    />
  )
}
