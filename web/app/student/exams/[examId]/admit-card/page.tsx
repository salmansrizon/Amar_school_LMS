import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { getStudentContext } from '@/lib/student/context'
import { loadInstitutePrintHeader, loadPrintThemeKey } from '@/lib/institute-print'
import { resolveTheme } from '@/lib/print-themes'
import { classSectionLabel } from '@/lib/students'
import { AdmitCardTemplate } from '@/app/school/exams/[id]/admit-cards/[studentId]/templates'

// The Student's own admit card (#450), printed browser-native (ADR 0007).
//
// Reuses AdmitCardTemplate rather than forking it, and resolves the school's
// saved palette through the same loader the office copy uses — 0144 opened
// school_print_themes and the logo bucket to Students precisely so the two
// documents come out looking like the same school's.
export default async function StudentAdmitCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>
  searchParams: Promise<{ template?: string; theme?: string }>
}) {
  const { examId } = await params
  const { template: templateParam, theme: themeParam } = await searchParams
  const lang = await currentLang()
  const { supabase, student } = await getStudentContext()

  // The exam has to be one this Student actually sits: student_exam_routine is
  // already scoped to their own class, so an unknown exam simply has no rows.
  const { data: routine } = await supabase
    .from('student_exam_routine')
    .select('exam_name, exam_year, room_name')
    .eq('exam_id', examId)
    .limit(1)
  if (!routine?.length) notFound()

  const [institute, themeKey, seatRes] = await Promise.all([
    loadInstitutePrintHeader(supabase, lang),
    loadPrintThemeKey(supabase, 'admit-card'),
    supabase.from('student_seat_assignment').select('room_name').eq('exam_id', examId).maybeSingle(),
  ])
  if (!institute) notFound()

  return (
    <AdmitCardTemplate
      lang={lang}
      institute={institute}
      examLabel={`${routine[0].exam_name} (${routine[0].exam_year})`}
      studentName={student.full_name}
      roll={student.roll_number !== null ? String(student.roll_number) : '—'}
      classSection={classSectionLabel(student.class_name, student.section) ?? '—'}
      guardianName="—"
      // The centre is the room the seat plan put them in; blank until published.
      examCenter={seatRes.data?.room_name ?? routine[0].room_name ?? '—'}
      photoSrc={student.photo_path ? '/api/student/photo' : null}
      // The QR on the school's copy verifies the card against the public
      // student-card route; a student printing their own is not issuing a
      // credential to themselves, so it carries none.
      qrSvg=""
      template={templateParam === '2' ? 2 : 1}
      theme={resolveTheme(themeParam, themeKey)}
    />
  )
}
