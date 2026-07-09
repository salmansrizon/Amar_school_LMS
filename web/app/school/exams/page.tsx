import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddExamForm, ExamRow } from './exam-controls'

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

  const { data: exams } = await supabase
    .from('exams')
    .select('id, name, exam_year, status, closed_at')
    .order('created_at', { ascending: false })

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('exams.title', lang)}</h1>
        <div className="flex items-center gap-4">
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
        {!exams?.length && <p className="text-sm text-muted">{t('exams.none', lang)}</p>}
        <ul className="divide-y divide-line">
          {exams?.map((exam) => (
            <li key={exam.id} className="py-3">
              <ExamRow exam={exam} lang={lang} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
