import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

// Roster picker for the single-student printables (issue #33, PRD §5.5) —
// the mockups' own entry point (a "Result Book" list) is out of scope here
// (split into issue #48's batch print-all); this is the minimal per-exam
// roster this ticket needs so Mark Sheet / Progress Report are actually
// reachable without it.

export default async function ExamPrintablesPage({ params }: { params: Promise<{ id: string }> }) {
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
    .select('id, name, exam_year, class_id')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const examLabel = `${exam.name} (${exam.exam_year})`

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-extrabold">
        {t('printables.title', lang)} — {examLabel}
      </h1>
      <Link href={`/school/exams/${exam.id}`} aria-label={t('examSetup.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
    </div>
  )

  if (!exam.class_id) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('markEntry.noClassSet', lang)}
        </p>
      </main>
    )
  }

  const { data: cls } = await supabase.from('classes').select('name, section').eq('id', exam.class_id).maybeSingle()
  let studentsQuery = supabase
    .from('students')
    .select('id, full_name, roll_number')
    .eq('class_name', cls?.name ?? '')
    .is('archived_at', null)
    .order('roll_number', { ascending: true, nullsFirst: false })
  studentsQuery = cls?.section ? studentsQuery.eq('section', cls.section) : studentsQuery.is('section', null)
  const { data: students } = await studentsQuery

  if (!students?.length) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('markEntry.noStudents', lang)}
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      {header}
      <section className="rounded-lg border border-line bg-paper p-4 shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-2 font-semibold">{t('students.roll', lang)}</th>
              <th className="py-2 pr-2 font-semibold">{t('students.name', lang)}</th>
              <th className="py-2 pr-2 font-semibold">{t('markSheet.docWord', lang)}</th>
              <th className="py-2 font-semibold">{t('progressReport.docWord', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b border-line">
                <td className="py-2 pr-2">{s.roll_number ?? '—'}</td>
                <td className="py-2 pr-2">{s.full_name}</td>
                <td className="py-2 pr-2">
                  <Link href={`/school/exams/${exam.id}/mark-sheet/${s.id}`} className="text-brand-600 hover:underline">
                    {t('markSheet.docWord', lang)}
                  </Link>
                </td>
                <td className="py-2">
                  <Link
                    href={`/school/exams/${exam.id}/progress-report/${s.id}`}
                    className="text-brand-600 hover:underline"
                  >
                    {t('progressReport.docWord', lang)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
