import { t, type Lang } from '@/lib/i18n'
import { SectionTabs, type SectionTab } from '@/components/ui/section-tabs'

// Institute section tabs — real routes, each with its own data/forms. Now the
// shared SectionTabs (the migration #509 left as a follow-up).
const TABS: readonly SectionTab[] = [
  { href: '/school/institute', labelKey: 'institute.tabProfile' },
  { href: '/school/institute/office-hour', labelKey: 'institute.tabOfficeHour' },
  { href: '/school/institute/venues', labelKey: 'institute.tabVenues' },
  { href: '/school/institute/checklist', labelKey: 'institute.tabChecklist' },
  { href: '/school/institute/logistics', labelKey: 'institute.tabLogistics' },
  { href: '/school/institute/templates', labelKey: 'institute.tabTemplates' },
]

export function InstituteTabs({ active, lang }: { active: string; lang: Lang }) {
  return <SectionTabs tabs={TABS} active={active} lang={lang} label={t('institute.title', lang)} />
}
