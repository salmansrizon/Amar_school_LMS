import { redirect } from 'next/navigation'

// RFID card assignment / automatic-attendance reconciliation is disabled for now.
// The attendance module is manual only, so the Attendance nav lands directly on
// the Mark Attendance tab. (The former RFID landing UI lives in git history.)
export default function AttendanceIndex() {
  redirect('/school/attendance/mark')
}
