import EmployeeLeaveManagementPage from '@/app/school/attendance/leave/employee/page'

// The employees list's leave "Review" row action, scoped to one pending
// request (map 013). A dedicated path — not /school/attendance/leave/employee
// itself — because that URL is also AttendanceTabs' own tab target, and the
// @modal slot is global to /school/** (app/school/layout.tsx), so intercepting
// it there would turn every tab switch into a popup too. This reuses the real
// leave-management page unmodified, preset the same way the old row action
// already did (?status=pending&view=<id>) — no duplicated logic.
export default async function EmployeeLeaveReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EmployeeLeaveManagementPage searchParams={Promise.resolve({ status: 'pending', view: id })} />
}
