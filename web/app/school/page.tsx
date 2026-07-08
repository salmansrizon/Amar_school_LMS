import { RoleShell } from '@/components/role-shell'

export default function SchoolHome() {
  return (
    <RoleShell
      group="/school"
      titleKey="home.school"
<<<<<<< HEAD
      links={[{ href: '/school/employees', labelKey: 'employees.title' }]}
=======
      links={[{ href: '/school/students', labelKey: 'students.title' }]}
>>>>>>> staging
      ownerLinks={[{ href: '/school/staff', labelKey: 'staff.title' }]}
    />
  )
}
