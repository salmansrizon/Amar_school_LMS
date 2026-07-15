import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { NoticeTabs } from '../notice-tabs'
import { CreateNoticeForm } from './create-form'

// Layout per ui/school-owner/notice-create.html: Type/Importance/Title, a
// Target Audience selector that reveals Class/Shift/Section pickers when
// "Specific" is chosen, Content, and optional Image/Link.
export default async function CreateNoticePage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: classes }, { data: shifts }] = await Promise.all([
    supabase.from('classes').select('name, section').order('name'),
    supabase.from('shifts').select('id, name').order('name'),
  ])
  const classNames = [...new Set((classes ?? []).map((c) => c.name))]
  const sections = [...new Set((classes ?? []).map((c) => c.section).filter(Boolean))] as string[]

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('notices.tabCreate', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <NoticeTabs active="create" lang={lang} />
      <CreateNoticeForm lang={lang} classNames={classNames} sections={sections} shifts={shifts ?? []} />
    </main>
  )
}
