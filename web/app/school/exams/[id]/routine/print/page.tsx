import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { dateToDayOfWeek, sortRoutineEntries } from '@/lib/exam-setup'
import { dayLabel } from '@/lib/routine'
import { PrintPage, InstituteHeader, PaginatedSheet, QrFooterRow } from '@/components/print/pieces'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import { PrintButton } from '@/components/print/print-button'

// Printable exam routine (ADR 0007: browser-native print), mirrors the class
// routine print page's shape.
//
// Issue #98 raised the bar on the OUTPUT, not the data model
// (exam_routine_entries already carries subject, date, start and end time):
// the shared institution header (#92) repeated on every page, notice-board
// typography — larger type, banded rows, the date column emphasised because
// that is what a student scans for — and pagination that never splits a row.

export default async function ExamRoutinePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [institute, { data: exam }] = await Promise.all([
    loadInstitutePrintHeader(supabase, lang),
    supabase.from('exams').select('id, name, exam_year').eq('id', id).maybeSingle(),
  ])
  if (!institute || !exam) notFound()

  const [{ data: entries }, { data: subjects }, { data: rooms }] = await Promise.all([
    supabase
      .from('exam_routine_entries')
      .select('exam_date, start_time, end_time, subject_id, room_id')
      .eq('exam_id', id),
    supabase.from('subjects').select('id, name'),
    supabase.from('rooms').select('id, name, buildings(name)'),
  ])

  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  // Room names only repeat across buildings since issue #93, so the printed
  // venue names both.
  const roomName = new Map(
    (rooms ?? []).map((r) => {
      const building = (r.buildings as unknown as { name: string } | null)?.name
      return [r.id, building ? `${building} — ${r.name}` : r.name]
    }),
  )
  const sorted = sortRoutineEntries(entries ?? [])
  const examLabel = `${exam.name} (${exam.exam_year})`

  const thClass =
    'border border-line-strong bg-paper-muted p-2 text-sm font-bold uppercase tracking-wide'
  const tdClass = 'border border-line-strong p-2 break-inside-avoid'

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/school/exams/${id}/routine`} aria-label={t('examRoutine.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <PrintButton label={t('print.print', lang)} />
      </div>

      <PrintPage>
        <PaginatedSheet
          header={
            <InstituteHeader
              institute={institute}
              docTitle={`${t('examRoutine.docWord', lang)} — ${examLabel}`}
            />
          }
        >
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-32" />
              <col />
              <col className="w-48" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>{t('examRoutine.date', lang)}</th>
                <th className={thClass}>{t('examRoutine.day', lang)}</th>
                <th className={thClass}>{t('examRoutine.time', lang)}</th>
                <th className={thClass}>{t('examRoutine.subject', lang)}</th>
                <th className={thClass}>{t('examRoutine.room', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e, i) => (
                // Banded rows: a reader tracking one line across five columns
                // on a wall needs the row, not the grid, to carry the eye.
                <tr key={i} className={i % 2 ? 'bg-paper-muted' : undefined}>
                  <td className={`${tdClass} text-center font-semibold`}>{e.exam_date}</td>
                  <td className={`${tdClass} text-center`}>
                    {dayLabel(dateToDayOfWeek(e.exam_date), lang)}
                  </td>
                  <td className={`${tdClass} text-center tabular-nums`}>
                    {e.start_time.slice(0, 5)} - {e.end_time.slice(0, 5)}
                  </td>
                  <td className={`${tdClass} font-semibold`}>
                    {(e.subject_id && subjectName.get(e.subject_id)) || '—'}
                  </td>
                  <td className={tdClass}>{(e.room_id && roomName.get(e.room_id)) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} />
        </PaginatedSheet>
      </PrintPage>
    </main>
  )
}
