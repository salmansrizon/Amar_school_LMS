import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { InstituteTabs } from '../tabs'
import { LogisticsTable } from './logistics-controls'
import { pageTitle } from '@/lib/page-title'

// Logistics / physical-file index (issue #39, PRD §5.11) per
// ui/school-owner/logistics-index.html.

export const generateMetadata = pageTitle('institute.tabLogistics')

export default async function LogisticsPage() {
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: entries } = await supabase
    .from('logistics_index')
    .select('id, item_type, year, storage_location, notes')
    .order('created_at', { ascending: false })

  return (
    <div>
      <PageHeader
        title={t('institute.tabLogistics', lang)}
        crumbs={schoolCrumbs('/school/institute/logistics', lang, { label: t('institute.tabLogistics', lang) })}
      />

      <InstituteTabs active="/school/institute/logistics" lang={lang} />

      <div className="rounded-lg border border-line bg-paper p-5">
        <LogisticsTable entries={entries ?? []} lang={lang} />
      </div>
    </div>
  )
}
