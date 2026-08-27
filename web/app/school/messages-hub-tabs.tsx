import { t, type Lang } from '@/lib/i18n'
import { SectionTabs } from '@/components/ui/section-tabs'
import { badgeCount, HUB_TABS } from '@/lib/student/hub'
import type { HubSummary } from '@/lib/student/hub-source'

// The tab bar for বার্তা ও অনুরোধ, in one place because the three tabs live in
// two different route trees (`/school/questions`, `/school/questions/response`,
// `/school/corrections`) and cannot share a layout.
//
// The badges count the CALLER's backlog, never the school's total — a teacher's
// badge is her own, because 0152 scopes the count. A permanent total nobody can
// clear is a number people stop reading.

const LABELS = {
  questions: 'hub.tabQuestions',
  corrections: 'hub.tabCorrections',
  response: 'hub.tabResponse',
} as const

export function HubTabs({
  active,
  lang,
  summary,
}: {
  active: string
  lang: Lang
  summary: HubSummary
}) {
  return (
    <SectionTabs
      label={t('hub.title', lang)}
      active={active}
      lang={lang}
      tabs={HUB_TABS.map((tab) => ({
        href: tab.href,
        labelKey: LABELS[tab.key],
        count: tab.countable
          ? badgeCount(tab.key === 'questions' ? summary.questions : summary.corrections)
          : null,
      }))}
    />
  )
}
