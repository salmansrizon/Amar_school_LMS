import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { AdmissionForm } from './admission-form'

// Layout per ui/school-owner/student-admission-form.html: carded sections
// Identity / Address / Guardian Info / Photo / Benefit Flags / Previous
// Institute / Sibling Info, Cancel + Save at the bottom. Roll is auto-assigned
// per School+class by the assign_student_roll trigger.

export default async function NewAdmissionPage() {
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ data: classes }] = await Promise.all([
    supabase.from('classes').select('name, section').order('created_at'),
  ])

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.admissionTitle', lang)}</h1>
        <Link href="/school/students" aria-label={t('students.listTitle', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <AdmissionForm lang={lang} classes={classes ?? []} />
    </main>
  )
}
