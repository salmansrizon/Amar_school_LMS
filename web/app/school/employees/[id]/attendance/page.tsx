import { EmployeeOwnAttendance, type EmployeeOwnAttendanceProps } from './employee-own-attendance'

export default function EmployeeOwnAttendancePage(props: EmployeeOwnAttendanceProps) {
  return <EmployeeOwnAttendance {...props} inModal={false} />
}
