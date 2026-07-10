import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { subjectsForClass } from '@/lib/students'
import { ClassPicker } from './class-picker'
import { BulkAssignForm } from './bulk-assign-form'

// Bulk "assign all" per class (issue #46, PRD §5.1 second half): pick a class,
// check which subjects apply and which of those are optional, assign to every
// student in that class. Per-student overrides live on the student detail page.

export default async function SubjectAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>
}) {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { class: selectedClass = '' } = await searchParams
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, section')
    .order('created_at')

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('subjects.title', lang)}</h1>
        <Link href="/school/classes" className="text-sm text-brand-600 hover:underline">
          ← {t('classes.title', lang)}
        </Link>
      </div>

      {!classes?.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('routine.noClasses', lang)}
        </p>
      ) : (
        <>
          <div className="mb-4">
            <ClassPicker classes={classes} selected={selectedClass} lang={lang} />
          </div>
          {selectedClass ? (
            <AssignmentPanel classId={selectedClass} lang={lang} />
          ) : (
            <p className="text-sm text-muted">{t('subjects.pickClass', lang)}</p>
          )}
        </>
      )}
    </main>
  )
}

async function AssignmentPanel({ classId, lang }: { classId: string; lang: Lang }) {
  const supabase = await createClient()
  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, section')
    .eq('id', classId)
    .maybeSingle()
  if (!cls) return <p className="text-sm text-alert-deep">{t('subjects.classNotFound', lang)}</p>

  const [{ data: subjects }, studentCountRes] = await Promise.all([
    supabase.from('subjects').select('id, name, class_id'),
    cls.section
      ? supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('class_name', cls.name)
          .eq('section', cls.section)
      : supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('class_name', cls.name)
          .is('section', null),
  ])

  const available = subjectsForClass(subjects ?? [], classId)
  return (
    <BulkAssignForm
      classId={classId}
      subjects={available}
      studentCount={studentCountRes.count ?? 0}
      lang={lang}
    />
  )
}
