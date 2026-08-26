import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { getStudentContext } from '@/lib/student/context'
import { loadGradingScheme } from '@/lib/grading-scheme-loader'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import { groupByExam, evaluateExam, type ResultRow } from '@/lib/student/results'
import { MarkSheetTemplate } from '@/app/school/exams/[id]/mark-sheet/[studentId]/templates'
import { classSectionLabel } from '@/lib/students'

// The Student's own mark sheet, printed browser-native (ADR 0007).
//
// Reuses MarkSheetTemplate rather than forking it — three template variants
// already exist and a fourth would drift. The template is prop-driven, so all
// this page does is assemble the props from the Student's own published result.
/** The three mark-sheet layouts, chosen by ?template=1|2|3 exactly as the
 *  school's own copy does. Print *themes* are an admit-card concept and do not
 *  apply here. */
function parseTemplate(value: string | undefined): 1 | 2 | 3 {
  return value === '2' ? 2 : value === '3' ? 3 : 1
}

export default async function StudentMarkSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>
  searchParams: Promise<{ template?: string }>
}) {
  const { examId } = await params
  const { template: templateParam } = await searchParams
  const lang = await currentLang()
  const { supabase, student } = await getStudentContext()

  const { data } = await supabase.from('student_exam_result').select('*').eq('exam_id', examId)
  const [exam] = groupByExam((data ?? []) as ResultRow[])
  if (!exam || !exam.gradingSchemeId) notFound()

  const [scheme, institute, rankRes] = await Promise.all([
    loadGradingScheme(supabase, exam.gradingSchemeId),
    loadInstitutePrintHeader(supabase, lang),
    supabase.rpc('student_exam_rank', { p_exam: examId }),
  ])
  if (!scheme || !institute) notFound()

  const evaluated = evaluateExam(exam, scheme)
  const rank = (rankRes.data as { rank: number; out_of: number }[] | null)?.[0] ?? null

  return (
    <MarkSheetTemplate
      lang={lang}
      institute={institute}
      examLabel={`${exam.examName} ${exam.examYear}`}
      studentName={student.full_name}
      roll={student.roll_number !== null ? String(student.roll_number) : '—'}
      classSection={classSectionLabel(student.class_name, student.section) ?? '—'}
      // The mark sheet's guardian line is the school's copy; a Student prints
      // their own and the name is on their profile, not needed here.
      guardianName="—"
      schemeType={scheme.schemeType}
      subjectRows={evaluated.subjects.map((s) => ({
        subjectId: s.subjectId,
        name: s.subjectName,
        full: s.fullMarks,
        obtained: s.obtainedMarks,
        label: s.label,
        gpa: s.gradePoint,
        passed: s.passed,
      }))}
      totalFull={evaluated.subjects.reduce((sum, s) => sum + s.fullMarks, 0)}
      totalObtained={evaluated.subjects.reduce((sum, s) => sum + s.obtainedMarks, 0)}
      overallGpa={evaluated.overall.gpa}
      overallLabel={evaluated.overall.label}
      overallPassed={evaluated.overall.passed}
      rankPosition={rank?.rank ?? null}
      rankOutOf={rank?.out_of ?? 0}
      // The QR on the school's copy verifies the document against the student
      // card route; a student's own copy is not a credential, so it carries none.
      qrSvg=""
      template={parseTemplate(templateParam)}
    />
  )
}
