import { currentLang } from '@/lib/i18n-server'
import { sidebarCollapsed } from '@/lib/ui-prefs-server'
import { StudentShell } from '@/components/student-shell'
import { getStudentContext } from '@/lib/student/context'

// /student/* chrome (#441): grouped nav, phone bottom tabs and the Profile link
// live in components/student-shell.tsx, menu data in lib/student-nav.ts.
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const collapsed = await sidebarCollapsed()
  const { student } = await getStudentContext()

  return (
    <StudentShell fullName={student.full_name} lang={lang} initialCollapsed={collapsed}>
      {children}
    </StudentShell>
  )
}
