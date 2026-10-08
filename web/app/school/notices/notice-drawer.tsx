import { CalendarDays, MapPin, Tag } from 'lucide-react'
import { t, type Lang, formatDate } from '@/lib/i18n'
import { kindLabel, targetAudienceLabel } from '@/lib/publishing'
import { withParams, type Params } from '@/lib/url-params'
import { DrawerFacts, type DrawerFact } from '@/components/data-table/drawer-parts'
import { NoticeDetail, type getNotice } from './[id]/notice-detail'

// Notice record drawer body (drawer redesign): Type/Target/Date facts above
// the existing NoticeDetail (badges, content, image, link, Delete — all
// unchanged; notice-detail.tsx is untouched, only imported from).

type Notice = NonNullable<Awaited<ReturnType<typeof getNotice>>>

export function NoticeDrawerBody({ notice, lang }: { notice: Notice; lang: Lang }) {
  const { row, offering } = notice
  const facts: DrawerFact[] = [
    { icon: <Tag className="size-3.5" aria-hidden />, label: t('notices.colType', lang), value: kindLabel(row.kind, lang) },
    {
      icon: <MapPin className="size-3.5" aria-hidden />,
      label: t('notices.colTarget', lang),
      value: targetAudienceLabel(
        {
          target_scope: row.target_scope,
          target_class_name: row.target_class_name,
          target_academic_year: row.target_academic_year ?? null,
          target_shift: row.target_shift ?? null,
          target_group_department: row.target_group_department ?? null,
          target_section: row.target_section,
        },
        lang,
        offering,
      ),
    },
    { icon: <CalendarDays className="size-3.5" aria-hidden />, label: t('notices.colDate', lang), value: formatDate(row.created_at, lang) },
  ]

  return (
    <div className="space-y-4">
      <DrawerFacts facts={facts} />
      <NoticeDetail notice={notice} lang={lang} />
    </div>
  )
}

export function noticeDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
