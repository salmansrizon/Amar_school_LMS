import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddExamForm, ExamsListClient } from './exam-controls'

// Layout per ui/school-owner/exams-list.html: search + class/status filter
// toolbar, "+ New Exam" quick-create (name/year only — full setup happens on
// the detail page, [id]/page.tsx), table of exams with Setup/Seat Plan
// actions (locked once Closed, issue #8's immutability rule).

export default async function ExamsPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: exams }, { data: classes }] = await Promise.all([
    supabase
      .from('exams')
      .select('id, name, exam_year, status, class_id, start_date')
      .order('created_at', { ascending: false }),
    supabase.from('classes').select('id, name, section').order('created_at'),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('exams.title', lang)}</h1>
        <div className="flex items-center gap-4">
          <Link href="/school/exams/grading-schemes" className="text-sm text-brand-600 hover:underline">
            {t('grading.title', lang)}
          </Link>
          <Link href="/school/exams/mark-sheet-preview" className="text-sm text-brand-600 hover:underline">
            {t('markSheet.title', lang)}
          </Link>
          <Link href="/school" className="text-sm text-brand-600 hover:underline">
            ← {t('common.back', lang)}
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('exams.add', lang)}</h2>
        <AddExamForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <ExamsListClient exams={exams ?? []} classes={classes ?? []} lang={lang} />
      </section>

      <p className="mt-3 text-xs text-muted">{t('exams.closedNote', lang)}</p>
    </main>
  )
}
