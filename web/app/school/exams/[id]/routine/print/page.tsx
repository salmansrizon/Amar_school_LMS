import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { dateToDayOfWeek } from '@/lib/exam-setup'
import { dayLabel } from '@/lib/routine'
import { PrintPage, InstituteHeader, QrFooterRow } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'

// Printable exam routine (ADR 0007: browser-native print), mirrors the class
// routine print page's shape.

export default async function ExamRoutinePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: school }, { data: exam }] = await Promise.all([
    supabase.from('schools').select('name').maybeSingle(),
    supabase.from('exams').select('id, name, exam_year').eq('id', id).maybeSingle(),
  ])
  if (!school || !exam) notFound()

  const [{ data: entries }, { data: subjects }, { data: rooms }] = await Promise.all([
    supabase
      .from('exam_routine_entries')
      .select('exam_date, start_time, end_time, subject_id, room_id')
      .eq('exam_id', id),
    supabase.from('subjects').select('id, name'),
    supabase.from('rooms').select('id, name'),
  ])

  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  const roomName = new Map((rooms ?? []).map((r) => [r.id, r.name]))
  const sorted = [...(entries ?? [])].sort(
    (a, b) => a.exam_date.localeCompare(b.exam_date) || a.start_time.localeCompare(b.start_time),
  )
  const examLabel = `${exam.name} (${exam.exam_year})`

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/school/exams/${id}/routine`} className="text-sm text-brand-600 hover:underline">
          ← {t('examRoutine.title', lang)}
        </Link>
        <PrintButton label={t('print.print', lang)} />
      </div>

      <PrintPage>
        <InstituteHeader name={school.name} docTitle={`${t('examRoutine.docWord', lang)} — ${examLabel}`} />

        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-line-strong bg-paper-muted p-1.5 font-semibold">
                {t('examRoutine.date', lang)}
              </th>
              <th className="border border-line-strong bg-paper-muted p-1.5 font-semibold">
                {t('examRoutine.day', lang)}
              </th>
              <th className="border border-line-strong bg-paper-muted p-1.5 font-semibold">
                {t('examRoutine.time', lang)}
              </th>
              <th className="border border-line-strong bg-paper-muted p-1.5 font-semibold">
                {t('examRoutine.subject', lang)}
              </th>
              <th className="border border-line-strong bg-paper-muted p-1.5 font-semibold">
                {t('examRoutine.room', lang)}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => (
              <tr key={i}>
                <td className="border border-line p-1.5 text-center">{e.exam_date}</td>
                <td className="border border-line p-1.5 text-center">
                  {dayLabel(dateToDayOfWeek(e.exam_date), lang)}
                </td>
                <td className="border border-line p-1.5 text-center">
                  {e.start_time.slice(0, 5)} - {e.end_time.slice(0, 5)}
                </td>
                <td className="border border-line p-1.5">
                  {(e.subject_id && subjectName.get(e.subject_id)) || '—'}
                </td>
                <td className="border border-line p-1.5">
                  {(e.room_id && roomName.get(e.room_id)) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} />
      </PrintPage>
    </main>
  )
}
