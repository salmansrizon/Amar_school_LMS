import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { SyllabusRow } from './syllabus-controls'

export default async function SyllabusPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: classes }, { data: syllabi }] = await Promise.all([
    supabase.from('classes').select('id, name, section').order('created_at'),
    supabase.from('class_syllabi').select('class_id, file_name'),
  ])

  const fileByClass = new Map((syllabi ?? []).map((s) => [s.class_id, s.file_name]))

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('syllabus.title', lang)}</h1>
        <Link href="/school/classes" className="text-sm text-brand-600 hover:underline">
          ← {t('classes.title', lang)}
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">{t('syllabus.intro', lang)}</p>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {!classes?.length ? (
          <p className="text-sm text-muted">{t('syllabus.noClasses', lang)}</p>
        ) : (
          <ul className="divide-y divide-line">
            {classes.map((c) => (
              <SyllabusRow
                key={c.id}
                classId={c.id}
                className={c.name}
                section={c.section}
                fileName={fileByClass.get(c.id) ?? null}
                lang={lang}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
