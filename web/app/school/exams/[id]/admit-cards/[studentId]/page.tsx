import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { classShiftLabel } from '@/lib/students'
import { roomForRoll } from '@/lib/exam-setup'
import { renderAuthenticityQr } from '@/lib/qr'
import { PrintButton } from '@/components/print/print-button'
import { TemplatePicker2 } from '@/components/print/template-picker'
import { ThemePicker } from '@/components/print/theme-picker'
import { AdmitCardTemplate } from './templates'
import { loadInstitutePrintHeader, loadPrintThemeKey } from '@/lib/institute-print'
import { resolveTheme } from '@/lib/print-themes'

// Admit card (issue #48, PRD §5.5), per ui/school-owner/admit-card-preview.html
// — identity + seat only, no grades. "Exam Center" is derived from the exam's
// seat plan (issue #47's exam_seat_plans, roomForRoll), not a stored column.

function parseTemplate(value: string | undefined): 1 | 2 {
  if (value === '2') return 2
  return 1
}

export default async function AdmitCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; studentId: string }>
  searchParams: Promise<{ template?: string; theme?: string }>
}) {
  const { id: examId, studentId } = await params
  const { template: templateParam, theme: themeParam } = await searchParams
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

  const institute = await loadInstitutePrintHeader(supabase, lang)
  if (!institute) notFound()
  // Per-print override (?theme=) beats the school's saved default (issue #94).
  const theme = resolveTheme(themeParam, await loadPrintThemeKey(supabase, 'admit-card'))

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, class_id')
    .eq('id', examId)
    .maybeSingle()
  if (!exam) notFound()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, roll_number, guardian_name, photo_path')
    .eq('id', studentId)
    .maybeSingle()
  if (!student) notFound()

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <Link href={`/school/exams/${examId}/admit-cards`} aria-label={t('admitCard.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      <div className="flex items-center gap-3">
        <TemplatePicker2
          selected={template}
          label={t('markSheet.pickTemplate', lang)}
          options={[t('markSheet.template1', lang), t('markSheet.template2', lang)]}
        />
        <ThemePicker selected={theme.key} label={t('admitCard.themeOverride', lang)} lang={lang} />
        <PrintButton label={t('print.print', lang)} />
      </div>
    </div>
  )

  let cls: { name: string; section: string | null } | null = null
  let examCenter: string | null = null
  if (exam.class_id) {
    const { data: clsRow } = await supabase.from('classes').select('name, section').eq('id', exam.class_id).maybeSingle()
    cls = clsRow ?? null
  }
  if (student.roll_number !== null) {
    const [{ data: seatRows }, { data: rooms }] = await Promise.all([
      supabase.from('exam_seat_plans').select('room_id, roll_start, roll_end').eq('exam_id', examId),
      supabase.from('rooms').select('id, name'),
    ])
    const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]))
    const seatPlanRoomRows = (seatRows ?? [])
      .map((r) => ({ roll_start: r.roll_start, roll_end: r.roll_end, roomName: roomNameById.get(r.room_id) ?? '' }))
      .filter((r) => r.roomName)
    examCenter = roomForRoll(seatPlanRoomRows, student.roll_number)
  }

  const examLabel = `${exam.name} ${exam.exam_year}`
  const qrSvg = await renderAuthenticityQr(
    `ADMITCARD|school:${institute.name}|exam:${examId}|student:${studentId}|roll:${student.roll_number ?? ''}`,
  )

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      {header}
      <AdmitCardTemplate
        lang={lang}
        institute={institute}
        theme={theme}
        examLabel={examLabel}
        studentName={student.full_name}
        roll={student.roll_number !== null ? String(student.roll_number) : '—'}
        classSection={classShiftLabel(cls?.name, cls?.section) ?? '—'}
        guardianName={student.guardian_name ?? '—'}
        examCenter={examCenter ?? '—'}
        photoSrc={student.photo_path ? `/api/student-photo?student=${studentId}` : null}
        qrSvg={qrSvg}
        template={template}
      />
    </main>
  )
}
