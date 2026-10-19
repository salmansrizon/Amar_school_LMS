import StudentTransferPage from '@/app/school/students/[id]/transfer/page'
import { routeModalPage } from '@/components/route-modal-page'

// Student row menu → Transfer, as a popup over the directory (the reference
// screen was always a modal: ui/school-owner/student-transfer-modal.html).
export default routeModalPage(StudentTransferPage, 'students.transfer')
