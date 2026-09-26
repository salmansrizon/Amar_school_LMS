import EmployeeOwnAttendancePage from '@/app/school/employees/[id]/attendance/page'
import { routeModalPage } from '@/components/route-modal-page'

// Employee row action as a popup over the list (map 013); /school/employees/[id]/
// attendance itself still renders on refresh. Employees list is the only place
// this href appears, so — unlike /school/attendance/employee — there's no
// competing tab-nav to collide with, and no UUID guard is needed either: this
// segment has no static siblings under employees/[id]/*.
export default routeModalPage(EmployeeOwnAttendancePage, 'employees.viewAttendance')
