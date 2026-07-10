import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AdmissionForm } from './admission-form'

// Layout per ui/school-owner/student-admission-form.html: carded sections
// Identity / Address / Guardian Info / Photo / Benefit Flags / Previous
// Institute / Sibling Info, Cancel + Save at the bottom. Roll is auto-assigned
// per School+class by the assign_student_roll trigger.

export default async function NewAdmissionPage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: classes }, { data: shifts }] = await Promise.all([
    supabase.from('classes').select('name, section').order('created_at'),
    supabase.from('shifts').select('id, name').order('created_at'),
  ])

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.admissionTitle', lang)}</h1>
        <Link href="/school/students" className="text-sm text-brand-600 hover:underline">
          ← {t('students.listTitle', lang)}
        </Link>
      </div>
      <AdmissionForm lang={lang} classes={classes ?? []} shifts={shifts ?? []} />
    </main>
  )
}
