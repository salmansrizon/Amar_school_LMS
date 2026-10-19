import EmployeeLeaveReviewPage from '@/app/school/employees/leave/[id]/page'
import { routeModalPage } from '@/components/route-modal-page'

// Employee row action as a popup over the list (map 013); /school/employees/
// leave/[id] itself still renders on refresh. Employees list is the only place
// this href appears, so — unlike /school/attendance/leave/employee — there's
// no competing tab-nav to collide with.
export default routeModalPage(EmployeeLeaveReviewPage, 'employees.reviewLeave')
