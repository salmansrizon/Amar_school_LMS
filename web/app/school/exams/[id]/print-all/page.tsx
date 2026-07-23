import Form from 'next/form'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { classShiftLabel } from '@/lib/students'
import { filterResultRoster, roomForRoll, type SeatPlanRoomRow } from '@/lib/exam-setup'
import { loadExamRosterResults } from '@/lib/exam-print-data'
import { loadProgressReportExtras } from '@/lib/progress-report-data'
import { renderAuthenticityQr } from '@/lib/qr'
import { PrintButton } from '@/components/print/print-button'
import { AdmitCardTemplate } from '../admit-cards/[studentId]/templates'
import { MarkSheetTemplate } from '../mark-sheet/[studentId]/templates'
import { ProgressReportTemplate } from '../progress-report/[studentId]/templates'

// Batch "print all" (issue #48, PRD §5.5): one page renders N PrintPages (one
// per matching roster student) and calls window.print() once — ADR 0007's
// documented batch mechanism, no separate server PDF step. Roll-range +
// promoted-only filtering (filterResultRoster, exam-setup.ts) is shared
// across all 3 doc types the ticket calls out; "promoted only" has no
// meaning for admit cards (no grades there), so that filter is silently
// ignored when doc=admit-card rather than shown disabled — the roll-range
// filter alone still applies.

export type PrintAllDoc = 'admit-card' | 'mark-sheet' | 'progress-report'

function parseDoc(value: string | undefined): PrintAllDoc {
  if (value === 'admit-card' || value === 'progress-report') return value
  return 'mark-sheet'
}

function parseTemplate(value: string | undefined, doc: PrintAllDoc): 1 | 2 | 3 {
  const max = doc === 'admit-card' ? 2 : 3
  const n = Number(value)
  return (Number.isInteger(n) && n >= 1 && n <= max ? n : 1) as 1 | 2 | 3
}

function parseRoll(value: string | undefined): number | null {
  const n = Number(value)
  return value && Number.isInteger(n) && n > 0 ? n : null
}

export default async function PrintAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ doc?: string; template?: string; rollFrom?: string; rollTo?: string; promotedOnly?: string }>
}) {
  const { id: examId } = await params
  const { doc: docParam, template: templateParam, rollFrom: rollFromParam, rollTo: rollToParam, promotedOnly: promotedOnlyParam } =
    await searchParams
  const doc = parseDoc(docParam)
  const template = parseTemplate(templateParam, doc)
  const rollFrom = parseRoll(rollFromParam)
  const rollTo = parseRoll(rollToParam)
  const promotedOnly = promotedOnlyParam === 'on' && doc !== 'admit-card'
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: school } = await supabase.from('schools').select('name, eiin_no').maybeSingle()
  if (!school) notFound()

  const { data: exam } = await supabase.from('exams').select('id, name, exam_year, class_id').eq('id', examId).maybeSingle()
  if (!exam) notFound()
  const examLabel = `${exam.name} ${exam.exam_year}`

  const toolbar = (
    <Form action={`/school/exams/${examId}/print-all`} className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('printAll.doc', lang)}</label>
        <select name="doc" defaultValue={doc} className="h-9 rounded-md border border-line px-2 text-sm">
          <option value="admit-card">{t('admitCard.docWord', lang)}</option>
          <option value="mark-sheet">{t('markSheet.docWord', lang)}</option>
          <option value="progress-report">{t('progressReport.docWord', lang)}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('printAll.template', lang)}</label>
        <select name="template" defaultValue={template} className="h-9 rounded-md border border-line px-2 text-sm">
          <option value="1">{t('markSheet.template1', lang)}</option>
          <option value="2">{t('markSheet.template2', lang)}</option>
          <option value="3">{t('markSheet.template3', lang)}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('printAll.rollFrom', lang)}</label>
        <input
          name="rollFrom"
          type="number"
          min={1}
          defaultValue={rollFromParam ?? ''}
          className="h-9 w-24 rounded-md border border-line px-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('printAll.rollTo', lang)}</label>
        <input
          name="rollTo"
          type="number"
          min={1}
          defaultValue={rollToParam ?? ''}
          className="h-9 w-24 rounded-md border border-line px-2 text-sm"
        />
      </div>
      <label className="flex h-9 items-center gap-2 text-sm">
        <input type="checkbox" name="promotedOnly" defaultChecked={promotedOnly} disabled={doc === 'admit-card'} />
        {t('printAll.promotedOnly', lang)}
      </label>
      <button type="submit" className="h-9 cursor-pointer rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-paper-muted">
        {t('resultInquiry.search', lang)}
      </button>
    </Form>
  )

  const header = (
    <div className="mb-4 flex items-center justify-between print:hidden">
      <h1 className="text-2xl font-extrabold">
        {t('printAll.title', lang)} — {examLabel}
      </h1>
      <div className="flex items-center gap-3">
        <Link href={`/school/exams/${examId}`} aria-label={t('examSetup.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <PrintButton label={t('print.print', lang)} />
      </div>
    </div>
  )

  if (!exam.class_id) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {header}
        {toolbar}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">{t('markEntry.noClassSet', lang)}</p>
      </main>
    )
  }
  const { data: cls } = await supabase.from('classes').select('name, section').eq('id', exam.class_id).maybeSingle()
  const classSection = classShiftLabel(cls?.name, cls?.section) ?? '—'

  // Admit cards need no grading scheme — plain roster + roll-range filter,
  // seat-plan lookup for Exam Center.
  if (doc === 'admit-card') {
    let studentsQuery = supabase
      .from('students')
      .select('id, full_name, roll_number, guardian_name, photo_path')
      .eq('class_name', cls?.name ?? '')
      .is('archived_at', null)
      .order('roll_number', { ascending: true, nullsFirst: false })
    studentsQuery = cls?.section ? studentsQuery.eq('section', cls.section) : studentsQuery.is('section', null)
    const [{ data: students }, { data: seatRows }, { data: rooms }] = await Promise.all([
      studentsQuery,
      supabase.from('exam_seat_plans').select('room_id, roll_start, roll_end').eq('exam_id', examId),
      supabase.from('rooms').select('id, name'),
    ])
    const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]))
    const seatPlanRoomRows: SeatPlanRoomRow[] = (seatRows ?? [])
      .map((r) => ({ roll_start: r.roll_start, roll_end: r.roll_end, roomName: roomNameById.get(r.room_id) ?? '' }))
      .filter((r) => r.roomName)

    const filtered = filterResultRoster(
      (students ?? []).map((s) => ({ ...s, rollNumber: s.roll_number, passed: true })),
      { rollFrom, rollTo, promotedOnly: false },
    )

    if (!filtered.length) {
      return (
        <main className="mx-auto w-full max-w-3xl flex-1 p-6">
          {header}
          {toolbar}
          <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">{t('markEntry.noStudents', lang)}</p>
        </main>
      )
    }

    const cards = await Promise.all(
      filtered.map(async (s) => ({
        studentId: s.id,
        studentName: s.full_name,
        roll: s.roll_number !== null ? String(s.roll_number) : '—',
        guardianName: s.guardian_name ?? '—',
        examCenter: roomForRoll(seatPlanRoomRows, s.roll_number) ?? '—',
        photoSrc: s.photo_path ? `/api/student-photo?student=${s.id}` : null,
        qrSvg: await renderAuthenticityQr(
          `ADMITCARD|school:${school.name}|exam:${examId}|student:${s.id}|roll:${s.roll_number ?? ''}`,
        ),
      })),
    )

    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {header}
        {toolbar}
        {cards.map((c) => (
          <AdmitCardTemplate
            key={c.studentId}
            lang={lang}
            schoolName={school.name}
            schoolMeta={school.eiin_no ? `EIIN: ${school.eiin_no}` : undefined}
            examLabel={examLabel}
            studentName={c.studentName}
            roll={c.roll}
            classSection={classSection}
            guardianName={c.guardianName}
            examCenter={c.examCenter}
            photoSrc={c.photoSrc}
            qrSvg={c.qrSvg}
            template={template === 2 ? 2 : 1}
          />
        ))}
      </main>
    )
  }

  // Mark sheet / progress report: whole-roster grading via
  // loadExamRosterResults (one query batch, not N individual loads).
  const roster = await loadExamRosterResults(supabase, examId)
  if (!roster || !roster.scheme) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {header}
        {toolbar}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">{t('promotion.noScheme', lang)}</p>
      </main>
    )
  }

  const filteredRows = filterResultRoster(
    roster.rows.map((r) => ({ ...r, rollNumber: r.rollNumber, passed: r.overall?.passed ?? false })),
    { rollFrom, rollTo, promotedOnly },
  )

  if (!filteredRows.length) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {header}
        {toolbar}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">{t('markEntry.noStudents', lang)}</p>
      </main>
    )
  }

  if (doc === 'mark-sheet') {
    const schemeType = roster.scheme.schemeType
    const sheets = await Promise.all(
      filteredRows.map(async (row) => ({
        row,
        qrSvg: await renderAuthenticityQr(
          `MARKSHEET|school:${school.name}|exam:${examId}|student:${row.studentId}|roll:${row.rollNumber ?? ''}`,
        ),
      })),
    )
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {header}
        {toolbar}
        {sheets.map(({ row, qrSvg }) => (
          <MarkSheetTemplate
            key={row.studentId}
            lang={lang}
            schoolName={school.name}
            examLabel={examLabel}
            studentName={row.fullName}
            roll={row.rollNumber !== null ? String(row.rollNumber) : '—'}
            classSection={classSection}
            guardianName={row.guardianName ?? '—'}
            schemeType={schemeType}
            subjectRows={row.subjectResults.map((r) => ({
              subjectId: r.subjectId,
              name: r.subjectName,
              full: r.result.fullMarks,
              obtained: r.result.obtainedMarks,
              label: r.result.label,
              gpa: r.result.gradePoint,
              passed: r.result.passed,
            }))}
            totalFull={row.totalFull}
            totalObtained={row.totalObtained}
            overallGpa={row.overall?.gpa ?? null}
            overallLabel={row.overall?.label ?? null}
            overallPassed={row.overall?.passed ?? false}
            rankPosition={row.rankPosition}
            rankOutOf={row.rankOutOf}
            qrSvg={qrSvg}
            template={template}
          />
        ))}
      </main>
    )
  }

  // progress-report
  const reports = await Promise.all(
    filteredRows.map(async (row) => {
      const [extras, qrSvg] = await Promise.all([
        loadProgressReportExtras(supabase, examId, row.studentId, exam.exam_year),
        renderAuthenticityQr(
          `PROGRESSREPORT|school:${school.name}|exam:${examId}|student:${row.studentId}|roll:${row.rollNumber ?? ''}`,
        ),
      ])
      return { row, extras, qrSvg }
    }),
  )

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      {header}
      {toolbar}
      {reports.map(({ row, extras, qrSvg }) => (
        <ProgressReportTemplate
          key={row.studentId}
          lang={lang}
          schoolName={school.name}
          examLabel={examLabel}
          studentName={row.fullName}
          roll={row.rollNumber !== null ? String(row.rollNumber) : '—'}
          classSection={classSection}
          attendancePercent={extras.attendancePercent}
          subjectRows={row.subjectResults.map((r) => ({
            subjectId: r.subjectId,
            name: r.subjectName,
            full: r.result.fullMarks,
            obtained: r.result.obtainedMarks,
            label: r.result.label,
            passed: r.result.passed,
          }))}
          behaviourRows={extras.behaviourRows}
          checklistItems={extras.checklistItems}
          rankPosition={row.rankPosition}
          rankOutOf={row.rankOutOf}
          qrSvg={qrSvg}
          template={template}
        />
      ))}
    </main>
  )
}
