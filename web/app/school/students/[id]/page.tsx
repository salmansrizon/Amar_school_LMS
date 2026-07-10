import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { averageRating, isEntryLocked } from '@/lib/behaviour'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddEntryForm, EditableEntry } from './behaviour-controls'
import { StudentSubjects, type AssignedSubject } from './subject-controls'

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, class_name, section')
    .eq('id', id)
    .single()
  if (!student) notFound()

  const [{ data: entries }, { data: subjects }, { data: assignments }] = await Promise.all([
    supabase
      .from('behaviour_log_entries')
      .select('id, note, rating, remind_date, created_at')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('subjects').select('id, name').order('name'),
    supabase.from('student_subjects').select('subject_id, is_optional').eq('student_id', id),
  ])

  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  const assignedSubjects: AssignedSubject[] = (assignments ?? []).map((a) => ({
    subject_id: a.subject_id,
    name: subjectName.get(a.subject_id) ?? a.subject_id,
    is_optional: a.is_optional,
  }))

  const now = new Date()
  const avg = averageRating((entries ?? []).map((e) => e.rating))

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{student.full_name}</h1>
        <Link href="/school/students" className="text-sm text-brand-600 hover:underline">
          ← {t('students.title', lang)}
        </Link>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {[student.class_name, student.section].filter(Boolean).join(' — ')}
        </p>
        <span className="flex items-center gap-2">
          <Link
            href={`/school/students/${id}/print/admission`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('students.printAdmission', lang)}
          </Link>
          <Link
            href={`/school/students/${id}/print/id-card`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('students.printIdCard', lang)}
          </Link>
        </span>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('subjects.title', lang)}</h2>
        <StudentSubjects
          studentId={student.id}
          assigned={assignedSubjects}
          available={subjects ?? []}
          lang={lang}
        />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{t('behaviour.title', lang)}</h2>
          {avg !== null && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">
              {t('behaviour.avg', lang)}: {avg}
            </span>
          )}
        </div>
        <AddEntryForm studentId={student.id} lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <p className="mb-3 text-xs text-muted">{t('behaviour.lockedHint', lang)}</p>
        {!entries?.length && <p className="text-sm text-muted">{t('behaviour.none', lang)}</p>}
        <ul className="divide-y divide-line">
          {entries?.map((entry) => (
            <li key={entry.id} className="py-3">
              <EditableEntry
                entry={entry}
                studentId={student.id}
                locked={isEntryLocked(new Date(entry.created_at), now)}
                lang={lang}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
