import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Card, PageHeader } from '@/components/ui/page'
import { getNotice, noticeMeta, NoticeDetail } from './notice-detail'

// Shared detail view for notice/homework/lesson-plan/daily-lesson/exam-prep
// rows (issue #37: one list/detail UI pattern across all publishing kinds).
// Same body as the list's drawer (map 013 FC3).
export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const notice = await getNotice(id)
  if (!notice) notFound()

  return (
    <>
      <PageHeader
        title={notice.row.title}
        backHref="/school/notices"
        backLabel={t('notices.tabList', lang)}
        crumbs={schoolCrumbs('/school/notices', lang, [
          { label: t('notices.title', lang), href: '/school/notices' },
          { label: notice.row.title },
        ])}
      />
      <Card>
        <p className="mb-4 text-sm text-muted">{noticeMeta(notice, lang)}</p>
        <NoticeDetail notice={notice} lang={lang} />
      </Card>
    </>
  )
}
