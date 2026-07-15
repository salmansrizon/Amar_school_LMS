import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { InstituteTabs } from '../tabs'
import { LogisticsTable } from './logistics-controls'

// Logistics / physical-file index (issue #39, PRD §5.11) per
// ui/school-owner/logistics-index.html.

export default async function LogisticsPage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: entries } = await supabase
    .from('logistics_index')
    .select('id, item_type, year, storage_location, notes')
    .order('created_at', { ascending: false })

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('institute.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <InstituteTabs active="/school/institute/logistics" lang={lang} />

      <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <LogisticsTable entries={entries ?? []} lang={lang} />
      </div>
    </main>
  )
}
