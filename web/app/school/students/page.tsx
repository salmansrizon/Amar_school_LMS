import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddStudentForm } from './add-student-form'

export default async function StudentsPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, class_name, section')
    .order('full_name')

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('students.add', lang)}</h2>
        <AddStudentForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {!students?.length && <p className="text-sm text-muted">{t('students.none', lang)}</p>}
        <ul className="divide-y divide-line">
          {students?.map((s) => (
            <li key={s.id}>
              <Link
                href={`/school/students/${s.id}`}
                className="flex items-center justify-between py-2 text-sm hover:text-brand-600"
              >
                <span className="font-medium">{s.full_name}</span>
                <span className="text-muted">
                  {[s.class_name, s.section].filter(Boolean).join(' — ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
