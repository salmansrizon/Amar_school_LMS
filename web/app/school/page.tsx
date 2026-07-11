import { RoleShell } from '@/components/role-shell'

export default function SchoolHome() {
  return (
    <RoleShell
      group="/school"
      titleKey="home.school"
      links={[
        { href: '/school/students', labelKey: 'students.title' },
        { href: '/school/employees', labelKey: 'employees.title' },
        { href: '/school/exams', labelKey: 'exams.title' },
        { href: '/school/fees', labelKey: 'fees.title' },
        { href: '/school/attendance', labelKey: 'attendance.title' },
        { href: '/school/classes', labelKey: 'classes.title' },
        { href: '/school/sms', labelKey: 'sms.title' },
        { href: '/school/notices', labelKey: 'notices.title' },
        { href: '/school/feedback', labelKey: 'feedback.title' },
      ]}
      ownerLinks={[{ href: '/school/staff', labelKey: 'staff.title' }]}
    />
  )
}
