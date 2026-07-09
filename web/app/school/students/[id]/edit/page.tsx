import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { StudentProfileForm } from '../../student-profile-form'

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: student }, { data: shifts }] = await Promise.all([
    supabase.from('students').select('*').eq('id', id).single(),
    supabase.from('shifts').select('id, name').order('name'),
  ])
  if (!student) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.edit', lang)}</h1>
        <Link href={`/school/students/${id}`} className="text-sm text-brand-600 hover:underline">
          ← {student.full_name}
        </Link>
      </div>
      <StudentProfileForm mode="edit" studentId={id} initial={student} shifts={shifts ?? []} lang={lang} />
    </main>
  )
}
