import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { navGroupFor } from '@/lib/school-nav'
import { mergeActivity, type ActivityItem, type ActivityType } from '@/lib/dashboard'
import { ACTIVITY_LABEL, describeActivity } from '@/components/activity-table'
import { PageHeader } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { pageTitle } from '@/lib/page-title'

// Full activity log — reached from the dashboard's "View All" (map 013, S1).
// Same three streams as the dashboard card (admissions / notices / feedback),
// now on the shared DataTable: search, a type chip per stream, pagination.
// No record drawer — every row already opens the underlying record (or the
// feedback inbox, which has no per-item route yet), so a summary panel would
// just repeat the one line the row already shows.

const TYPE_TONE: Record<ActivityType, 'mint' | 'sun' | 'alert'> = {
  admission: 'mint',
  notice: 'sun',
  feedback: 'alert',
}

const PAGE_SIZE = 20

export const generateMetadata = pageTitle('activity.title')

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const { q = '', type = '', page, size } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ data: students }, { data: notices }, { data: feedback }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('publications').select('id, title, created_at').order('created_at', { ascending: false }).limit(50),
    supabase.from('feedback_messages').select('id, subject, created_at').order('created_at', { ascending: false }).limit(50),
  ])

  const activity = mergeActivity(
    { students: students ?? [], notices: notices ?? [], feedback: feedback ?? [] },
    100,
  )

  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const fmt = numberFmt(lang)
  const needle = q.trim().toLowerCase()
  const countOf = (ty: ActivityType) => activity.filter((a) => a.type === ty).length
  const visible = activity.filter(
    (a) => (!needle || describeActivity(a, lang).toLowerCase().includes(needle)) && (!type || a.type === type),
  )
  const pageData = paginate(visible, page, pageSize)
  const group = navGroupFor('/school/activity')?.group

  const columns: Column<ActivityItem>[] = [
    {
      key: 'type',
      header: t('dash.raType', lang),
      card: 'badge',
      cell: (a) => <Pill tone={TYPE_TONE[a.type]}>{t(ACTIVITY_LABEL[a.type], lang)}</Pill>,
    },
    {
      key: 'description',
      header: t('dash.raDescription', lang),
      card: 'title',
      cell: (a) =>
        a.href ? (
          <Link href={a.href} className="font-medium hover:underline">
            {describeActivity(a, lang)}
          </Link>
        ) : (
          describeActivity(a, lang)
        ),
    },
    {
      key: 'when',
      header: t('dash.raWhen', lang),
      cell: (a) => <span className="text-xs text-muted tabular-nums">{dateFmt.format(new Date(a.at))}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        icon="activity"
        title={t('activity.title', lang)}
        crumbs={{
          lang,
          items: [
            { label: t('dash.dashboard', lang), href: '/school' },
            ...(group ? [{ label: t(group.labelKey, lang) }] : []),
            { label: t('activity.title', lang) },
          ],
        }}
        badge={`${t('pager.total', lang)}: ${fmt.format(activity.length)}`}
      />

      <DataTable
        rows={pageData.items}
        rowId={(a) => a.id ?? `${a.type}:${a.at}`}
        rowLabel={(a) => describeActivity(a, lang)}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('activity.title', lang)}
        search={{ placeholder: t('activity.search', lang) }}
        chips={(['admission', 'notice', 'feedback'] as const).map((ty) => ({
          param: 'type',
          value: ty,
          label: `${t(ACTIVITY_LABEL[ty], lang)} (${fmt.format(countOf(ty))})`,
        }))}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          activity.length ? (
            <EmptyState
              icon="activity"
              title={t('activity.noMatch', lang)}
              action={{ href: '/school/activity', label: t('students.clearFilters', lang) }}
              lang={lang}
            />
          ) : (
            <EmptyState
              icon="activity"
              title={t('dash.raNone', lang)}
              action={{ href: '/school', label: t('denied.back', lang) }}
              lang={lang}
            />
          )
        }
      />
    </>
  )
}
