import ExamSetupPage from '@/app/school/exams/[id]/page'
import { routeModalPage } from '@/components/route-modal-page'
import { ReloadToRealPage } from '@/components/route-modal'

// Exam row action as a popup over the list; /school/exams/[id] itself still renders on refresh.
const ExamSetupModal = routeModalPage(ExamSetupPage, 'examSetup.basicInfo')

// [id] also matches the static siblings (grading-schemes, combinations,
// cocurricular-items, result-inquiry …) on soft navigation; an exam id is a UUID.
const EXAM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Page(props: Parameters<typeof ExamSetupModal>[0]) {
  const { id } = await props.params
  if (!EXAM_ID.test(id)) return <ReloadToRealPage />
  return <ExamSetupModal {...props} />
}
