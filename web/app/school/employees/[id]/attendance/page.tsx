import { notFound } from 'next/navigation'
import { getSchoolContext } from '@/lib/school/context'
import EmployeeAttendancePage from '@/app/school/attendance/employee/page'

// The employees list's "View attendance" row action, scoped to one employee
// (map 013). A dedicated path — not /school/attendance/employee itself —
// because that URL is also AttendanceTabs' own tab target, and the @modal
// slot is global to /school/** (app/school/layout.tsx), so intercepting it
// there would turn every tab switch (and the page's own search form) into a
// popup too. This reuses the real attendance page unmodified, filtered the
// same way the old row action already did (?q=<name>) — no duplicated logic.
export default async function EmployeeOwnAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getSchoolContext()
  const { data: employee } = await supabase
    .from('employee_card')
    .select('full_name')
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle()
  if (!employee) notFound()
  return <EmployeeAttendancePage searchParams={Promise.resolve({ q: employee.full_name })} />
}
