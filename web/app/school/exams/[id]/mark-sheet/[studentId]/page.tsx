import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { classSectionLabel } from '@/lib/students'
import { loadExamPrintContext } from '@/lib/exam-print-data'
import { renderAuthenticityQr } from '@/lib/qr'
import { PrintButton } from '@/components/print/print-button'
import { TemplatePicker } from '@/components/print/template-picker'
import { MarkSheetTemplate } from './templates'
import { loadInstitutePrintHeader } from '@/lib/institute-print'

// Real per-student mark sheet (issue #33, PRD §5.5), the production
// successor to the issue #25 POC (/school/exams/mark-sheet-preview) — grades
// via grading.ts (issue #31), class rank via exam-results.ts's rankResults
// (issue #32), 3 layout templates picked by ?template=1|2|3.

function parseTemplate(value: string | undefined): 1 | 2 | 3 {
  if (value === '2') return 2
  if (value === '3') return 3
  return 1
}

export default async function MarkSheetPage({
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
  const institute = await loadInstitutePrintHeader(supabase, lang)
  if (schoolError || !school) notFound()

  const ctx = await loadExamPrintContext(supabase, examId, studentId)
  if (!ctx) notFound()

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <Link href={`/school/exams/${examId}/printables`} aria-label={t('exams.printables', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
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
  const qrSvg = await renderAuthenticityQr(
    `MARKSHEET|school:${school.name}|exam:${examId}|student:${studentId}|roll:${ctx.student.roll_number ?? ''}`,
  )

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      {header}
      <MarkSheetTemplate
        lang={lang}
        institute={institute!}
        examLabel={examLabel}
        studentName={ctx.student.full_name}
        roll={ctx.student.roll_number !== null ? String(ctx.student.roll_number) : '—'}
        classSection={classSectionLabel(ctx.cls?.name, ctx.cls?.section) ?? '—'}
        guardianName={ctx.student.guardian_name ?? '—'}
        schemeType={ctx.scheme.schemeType}
        subjectRows={ctx.subjectResults.map((r) => ({
          subjectId: r.subjectId,
          name: r.subjectName,
          full: r.result.fullMarks,
          obtained: r.result.obtainedMarks,
          label: r.result.label,
          gpa: r.result.gradePoint,
          passed: r.result.passed,
        }))}
        totalFull={ctx.subjectResults.reduce((s, r) => s + r.result.fullMarks, 0)}
        totalObtained={ctx.subjectResults.reduce((s, r) => s + r.result.obtainedMarks, 0)}
        overallGpa={ctx.overall.gpa}
        overallLabel={ctx.overall.label}
        overallPassed={ctx.overall.passed}
        rankPosition={ctx.rankPosition}
        rankOutOf={ctx.rankOutOf}
        qrSvg={qrSvg}
        template={template}
      />
    </main>
  )
}
