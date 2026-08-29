import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { InstituteTabs } from '../tabs'
import { LogisticsTable } from './logistics-controls'

// Logistics / physical-file index (issue #39, PRD §5.11) per
// ui/school-owner/logistics-index.html.

export default async function LogisticsPage() {
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: entries } = await supabase
    .from('logistics_index')
    .select('id, item_type, year, storage_location, notes')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('institute.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <InstituteTabs active="/school/institute/logistics" lang={lang} />

      <div className="rounded-lg border border-line bg-paper p-5">
        <LogisticsTable entries={entries ?? []} lang={lang} />
      </div>
    </div>
  )
}
