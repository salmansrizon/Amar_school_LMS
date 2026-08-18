import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { PageHeader } from '@/components/ui/page'
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
    <>
      <PageHeader
        title={t('students.admissionTitle', lang)}
        backHref="/school/students"
        backLabel={t('students.listTitle', lang)}
      />
      <AdmissionForm lang={lang} classes={classes ?? []} />
    </>
  )
}
