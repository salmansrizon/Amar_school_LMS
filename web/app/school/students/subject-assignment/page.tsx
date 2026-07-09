import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { BulkAssignForm } from './bulk-assign-form'

export default async function SubjectAssignmentPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: classRows }, { data: subjects }] = await Promise.all([
    supabase.from('students').select('class_name').is('archived_at', null).not('class_name', 'is', null),
    supabase.from('subjects').select('id, name').order('name'),
  ])
  const classes = [...new Set((classRows ?? []).map((r) => r.class_name as string))].sort()

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.subjectAssignment', lang)}</h1>
        <Link href="/school/students" className="text-sm text-brand-600 hover:underline">
          ← {t('students.title', lang)}
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">{t('students.bulkAssignIntro', lang)}</p>
      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <BulkAssignForm classes={classes} subjects={subjects ?? []} lang={lang} />
      </section>
    </main>
  )
}
