import Link from 'next/link'
import { AlertTriangle, CalendarDays, Megaphone, Star } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs, headerPrimary, headerSecondary } from '@/lib/school-crumbs'
import { selectAllRows } from '@/lib/supabase/select-all'
import {
  IMPORTANCE_LEVELS,
  PUBLICATION_KINDS,
  filterPublications,
  importanceBadgeClass,
  importanceLabel,
  kindBadgeClass,
  kindLabel,
  targetAudienceLabel,
  type Importance,
  type PublicationKind,
  type TargetScope,
} from '@/lib/publishing'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { NoticeTabs } from './notice-tabs'
import { getNotice, noticeMeta, NoticeDetail } from './[id]/notice-detail'

// Notices (map 013 FC3, new_ui/04-finance-communication/notices): one shared
// list for notices, homework, lesson plans, daily lessons and exam-prep —
// stat cards, DataTable (title search, Type filter, Importance filter + chips)
// and a drawer showing the record (with Delete). There is no edit action for a
// publication; the full page `[id]` stays. Compose/targeting unchanged.

type Row = {
  id: string
  kind: PublicationKind
  title: string
  importance: Importance
  target_scope: TargetScope
  class_offering_id: string | null
  target_class_name: string | null
  target_academic_year: number | null
  target_shift: string | null
  target_group_department: string | null
  target_section: string | null
  created_at: string
}

const PAGE_SIZE = 20

export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; importance?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', kind = '', importance = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const fmt = numberFmt(lang)
  const { supabase } = await getSchoolContext()

  const [{ rows }, { data: offeringRows }, viewed] = await Promise.all([
    selectAllRows<Row>((from, to) =>
      supabase
        .from('publications')
        .select(
          'id, kind, title, importance, target_scope, class_offering_id, target_class_name, target_academic_year, target_shift, target_group_department, target_section, created_at',
        )
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
    // Resolve an 'offering'-scope row's label back to its Class Catalogue
    // name (map #598 Wave 6, #607). One fetch, indexed by id.
    supabase.from('class_offerings').select('id, name, section, group_department, shift'),
    view ? getNotice(view) : Promise.resolve(null),
  ])
  const offeringById = new Map((offeringRows ?? []).map((o) => [o.id, o]))
  const visible = filterPublications(rows, q, kind as PublicationKind | '').filter(
    (r) => !importance || r.importance === importance,
  )
  const pageData = paginate(visible, page, pageSize)
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const monthStart = new Date().toISOString().slice(0, 7)
  const count = (pred: (r: Row) => boolean) => fmt.format(rows.filter(pred).length)

  const badge = (cls: string, label: string) => (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
  )
  const columns: Column<Row>[] = [
    { key: 'title', header: t('notices.colTitle', lang), card: 'title', cell: (r) => <span className="font-semibold">{r.title}</span> },
    { key: 'kind', header: t('notices.colType', lang), card: 'badge', cell: (r) => badge(kindBadgeClass(r.kind), kindLabel(r.kind, lang)) },
    {
      key: 'importance',
      header: t('notices.colImportance', lang),
      card: 'badge',
      cell: (r) => badge(importanceBadgeClass(r.importance), importanceLabel(r.importance, lang)),
    },
    {
      key: 'target',
      header: t('notices.colTarget', lang),
      cell: (r) =>
        targetAudienceLabel(r, lang, r.class_offering_id ? (offeringById.get(r.class_offering_id) ?? null) : null),
    },
    { key: 'date', header: t('notices.colDate', lang), cell: (r) => new Date(r.created_at).toLocaleDateString(locale) },
  ]

  return (
    <>
      <PageHeader
        title={t('notices.title', lang)}
        crumbs={schoolCrumbs('/school/notices', lang, [{ label: t('notices.title', lang) }])}
        badge={`${t('pager.total', lang)}: ${fmt.format(rows.length)}`}
        actions={
          <>
            <Link href="/school/notices/gallery" className={headerSecondary}>
              {t('notices.tabGallery', lang)}
            </Link>
            <Link href="/school/notices/new" className={headerPrimary}>
              + {t('notices.new', lang)}
            </Link>
          </>
        }
      />

      <NoticeTabs active="list" lang={lang} />

      <StatGrid>
        <StatCard icon={<Megaphone className="size-5" />} label={t('notices.statTotal', lang)} value={fmt.format(rows.length)} />
        <StatCard
          icon={<AlertTriangle className="size-5" />}
          tone="alert"
          label={t('notices.statUrgent', lang)}
          value={count((r) => r.importance === 'urgent')}
          action={{ href: '/school/notices?importance=urgent', label: t('notices.view', lang) }}
        />
        <StatCard
          icon={<Star className="size-5" />}
          tone="sun"
          label={t('notices.statImportant', lang)}
          value={count((r) => r.importance === 'important')}
          action={{ href: '/school/notices?importance=important', label: t('notices.view', lang) }}
        />
        <StatCard
          icon={<CalendarDays className="size-5" />}
          tone="sky"
          label={t('notices.statThisMonth', lang)}
          value={count((r) => r.created_at.startsWith(monthStart))}
        />
      </StatGrid>

      <DataTable
        rows={pageData.items}
        rowId={(r) => r.id}
        rowLabel={(r) => r.title}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('notices.title', lang)}
        search={{ placeholder: t('notices.search', lang) }}
        filters={[
          {
            param: 'kind',
            label: t('notices.colType', lang),
            options: PUBLICATION_KINDS.map((k) => ({ value: k.key, label: k.label[lang] })),
          },
          {
            param: 'importance',
            label: t('notices.colImportance', lang),
            options: IMPORTANCE_LEVELS.map((i) => ({ value: i.key, label: i.label[lang] })),
          },
        ]}
        chips={[
          { param: 'importance', value: 'urgent', label: importanceLabel('urgent', lang) },
          { param: 'importance', value: 'important', label: importanceLabel('important', lang) },
          { param: 'kind', value: 'homework', label: kindLabel('homework', lang) },
        ]}
        rowActions={(r) => <ViewLink id={r.id} params={params} label={t('notices.view', lang)} name={r.title} />}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <Card>
            <p className="text-sm text-muted">{t('notices.none', lang)}</p>
          </Card>
        }
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.row.title ?? ''}
        subtitle={viewed ? noticeMeta(viewed, lang) : undefined}
        fullPageHref={viewed ? `/school/notices/${viewed.row.id}` : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && <NoticeDetail notice={viewed} lang={lang} />}
      </RecordDrawer>
    </>
  )
}
