import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { subjectsForClass } from '@/lib/students'
import { AddRoutineEntryForm, RoutineTable, type Option, type RoutineEntryRow } from './routine-controls'

// Layout per ui/school-owner/exam-routine.html: toolbar (exam label + Exam
// Setup / Print / Save) over a Date/Day/Time/Subject/Room table. Day is
// derived from exam_date (dateToDayOfWeek), not stored.

export default async function ExamRoutinePage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, status, class_id')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const closed = exam.status === 'closed'

  const [{ data: entries }, { data: allSubjects }, { data: rooms }] = await Promise.all([
    supabase
      .from('exam_routine_entries')
      .select('id, subject_id, exam_date, start_time, end_time, room_id')
      .eq('exam_id', id),
    supabase.from('subjects').select('id, name, class_id').order('name'),
    supabase.from('rooms').select('id, name').eq('is_active', true).order('name'),
  ])

  const subjectOpts: Option[] = exam.class_id
    ? subjectsForClass(allSubjects ?? [], exam.class_id).map((s) => ({ id: s.id, label: s.name }))
    : []
  const roomOpts: Option[] = (rooms ?? []).map((r) => ({ id: r.id, label: r.name }))
  const examLabel = `${exam.name} (${exam.exam_year})`

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('examRoutine.title', lang)}</h1>
        <Link href={`/school/exams/${exam.id}`} className="text-sm text-brand-600 hover:underline">
          ← {t('examSetup.title', lang)}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">{examLabel}</span>
        <a
          href={`/school/exams/${exam.id}/routine/print`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('examRoutine.print', lang)}
        </a>
      </div>

      <section className="rounded-lg border border-line bg-paper p-4 shadow-card">
        {!entries?.length ? (
          <p className="mb-4 text-sm text-muted">{t('examRoutine.none', lang)}</p>
        ) : (
          <div className="mb-4">
            <RoutineTable
              examId={exam.id}
              entries={entries as RoutineEntryRow[]}
              subjects={subjectOpts}
              rooms={roomOpts}
              disabled={closed}
              lang={lang}
            />
          </div>
        )}
        {!closed &&
          (subjectOpts.length ? (
            <AddRoutineEntryForm examId={exam.id} subjects={subjectOpts} rooms={roomOpts} lang={lang} />
          ) : (
            <p className="text-sm text-muted">{t('examSetup.noClassSet', lang)}</p>
          ))}
      </section>
    </main>
  )
}
