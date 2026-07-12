import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { classShiftLabel } from '@/lib/students'
import { ratingBand } from '@/lib/behaviour'
import { attendancePercent } from '@/lib/attendance-manual'
import { sortCocurricularItems, buildChecklistRows } from '@/lib/cocurricular'
import { loadExamPrintContext } from '@/lib/exam-print-data'
import { renderAuthenticityQr } from '@/lib/qr'
import { PrintButton } from '@/components/print/print-button'
import { TemplatePicker } from '@/components/print/template-picker'
import { ProgressReportTemplate } from './templates'

// Real per-student progress report (issue #33, PRD §5.5): subject marks +
// grade via grading.ts (issue #31), rank via exam-results.ts (issue #32),
// Behaviour Rating read from behaviour_log_entries (issue #7/#46 — not a new
// data model), Co-curricular Checklist read from cocurricular_items /
// cocurricular_checklist_marks (migration 0052, new for this ticket).

const BEHAVIOUR_ENTRY_LIMIT = 5

function parseTemplate(value: string | undefined): 1 | 2 | 3 {
  if (value === '2') return 2
  if (value === '3') return 3
  return 1
}

export default async function ProgressReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; studentId: string }>
  searchParams: Promise<{ template?: string }>
}) {
  const { id: examId, studentId } = await params
  const { template: templateParam } = await searchParams
  const template = parseTemplate(templateParam)
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: school, error: schoolError } = await supabase.from('schools').select('name').maybeSingle()
  if (schoolError || !school) notFound()

  const ctx = await loadExamPrintContext(supabase, examId, studentId)
  if (!ctx) notFound()

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <Link href={`/school/exams/${examId}/printables`} className="text-sm text-brand-600 hover:underline">
        ← {t('exams.printables', lang)}
      </Link>
      <div className="flex items-center gap-3">
        <TemplatePicker
          selected={template}
          label={t('markSheet.pickTemplate', lang)}
          options={[t('markSheet.template1', lang), t('markSheet.template2', lang), t('markSheet.template3', lang)]}
        />
        <PrintButton label={t('print.print', lang)} />
      </div>
    </div>
  )

  if (!ctx.scheme || !ctx.overall) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {!ctx.exam.class_id
            ? t('markEntry.noClassSet', lang)
            : !ctx.exam.grading_scheme_id
              ? t('markEntry.noScheme', lang)
              : t('markEntry.noSubjects', lang)}
        </p>
      </main>
    )
  }

  const examLabel = `${ctx.exam.name} ${ctx.exam.exam_year}`

  // Attendance % window: school-year-to-date — Jan 1 of the exam's year
  // through today, clamped to Dec 31 for a past exam year.
  const today = new Date().toISOString().slice(0, 10)
  const yearEnd = `${ctx.exam.exam_year}-12-31`
  const rangeEnd = today < yearEnd ? today : yearEnd
  const rangeStart = `${ctx.exam.exam_year}-01-01`

  const [{ data: behaviourEntries }, { data: items }, { data: markRows }, presentResult, absentResult] =
    await Promise.all([
      supabase
        .from('behaviour_log_entries')
        .select('id, note, rating')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(BEHAVIOUR_ENTRY_LIMIT),
      supabase.from('cocurricular_items').select('id, label, sort_order'),
      supabase.from('cocurricular_checklist_marks').select('item_id, checked').eq('exam_id', examId).eq('student_id', studentId),
      supabase
        .from('attendance_records')
        .select('id', { count: 'exact', head: true })
        .eq('person_type', 'student')
        .eq('person_id', studentId)
        .gte('att_date', rangeStart)
        .lte('att_date', rangeEnd),
      supabase.rpc('absent_working_days_in_range', {
        p_student: studentId,
        p_start: rangeStart,
        p_end: rangeEnd,
      }),
    ])

  const checkedIds = new Set((markRows ?? []).filter((m) => m.checked).map((m) => m.item_id))
  const checklistItems = buildChecklistRows(sortCocurricularItems(items ?? []), checkedIds)
  const attendancePct = attendancePercent(presentResult.count ?? 0, absentResult.data ?? 0)

  const qrSvg = await renderAuthenticityQr(
    `PROGRESSREPORT|school:${school.name}|exam:${examId}|student:${studentId}|roll:${ctx.student.roll_number ?? ''}`,
  )

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      {header}
      <ProgressReportTemplate
        lang={lang}
        schoolName={school.name}
        examLabel={examLabel}
        studentName={ctx.student.full_name}
        roll={ctx.student.roll_number !== null ? String(ctx.student.roll_number) : '—'}
        classSection={classShiftLabel(ctx.cls?.name, ctx.cls?.section) ?? '—'}
        attendancePercent={attendancePct}
        subjectRows={ctx.subjectResults.map((r) => ({
          subjectId: r.subjectId,
          name: r.subjectName,
          full: r.result.fullMarks,
          obtained: r.result.obtainedMarks,
          label: r.result.label,
          passed: r.result.passed,
        }))}
        behaviourRows={(behaviourEntries ?? []).map((e) => ({
          id: e.id,
          note: e.note,
          band: ratingBand(e.rating),
        }))}
        checklistItems={checklistItems}
        rankPosition={ctx.rankPosition}
        rankOutOf={ctx.rankOutOf}
        qrSvg={qrSvg}
        template={template}
      />
    </main>
  )
}
