import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { AddExamForm, ExamsListClient } from './exam-controls'
import { ExamsTabs } from './exams-tabs'

// Layout per ui/school-owner/exams-list.html: search + class/status filter
// toolbar, "+ New Exam" quick-create (name/year only — full setup happens on
// the detail page, [id]/page.tsx), table of exams with Setup/Seat Plan
// actions (locked once Closed, issue #8's immutability rule).

export default async function ExamsPage() {
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ data: exams }, { data: classes }] = await Promise.all([
    supabase
      .from('exams')
      .select('id, name, exam_year, status, class_id, start_date')
      .order('created_at', { ascending: false }),
    supabase.from('classes').select('id, name, section').order('created_at'),
  ])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('exams.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <ExamsTabs active="/school/exams" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">{t('exams.add', lang)}</h2>
        <AddExamForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <ExamsListClient exams={exams ?? []} classes={classes ?? []} lang={lang} />
      </section>

      <p className="mt-3 text-xs text-muted">{t('exams.closedNote', lang)}</p>
    </div>
  )
}
