import ExamSetupPage from '@/app/school/exams/[id]/page'
import { routeModalPage } from '@/components/route-modal-page'

// Exam row action as a popup over the list; /school/exams/[id] itself still renders on refresh.
export default routeModalPage(ExamSetupPage, 'examSetup.basicInfo')
