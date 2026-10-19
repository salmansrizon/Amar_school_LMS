import Link from 'next/link'
import { AlertTriangle, CalendarDays, Megaphone, Star } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang, formatDate } from '@/lib/i18n'
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
import { StatCard, StatGrid, WarningBanner, WorkflowCard } from '@/components/ui/widgets'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { RowActionPill } from '@/components/data-table/row-action-pill'
import { withParams } from '@/lib/url-params'
import { NoticeTabs } from './notice-tabs'
import { getNotice, noticeMeta } from './[id]/notice-detail'
import { DrawerFooter, DrawerHeader } from '@/components/data-table/drawer-parts'
import { NoticeDrawerBody, noticeDrawerCancelHref } from './notice-drawer'
import { pageTitle } from '@/lib/page-title'
import { isMissingColumnError } from '@/lib/leave-columns'
import { isUnpublished } from '@/lib/school/publication-status'

// Notices (map 013 FC3, new_ui/04-finance-communication/notices), following
// the exam-landing pattern (013 A3): header + subtitle, a one-line urgent-
// notices warning banner, stat cards, DataTable (title opens the drawer, one
// "View" pill per row — there is no edit action for a publication, so nothing
// hides behind a ⋮), then two workflow cards — items needing attention and
// this month's other publication types. The full page `[id]` stays for the
// drawer's "open full page" link. Compose/targeting unchanged.

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
  due_at: string | null
  /** Absent until migration 0252 is applied (#696). */
  unpublished_at?: string | null
}

const PAGE_SIZE = 20

export const generateMetadata = pageTitle('notices.title')

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
    (async () => {
      const load = (columns: string) =>
        selectAllRows<Row>((from, to) =>
          supabase
            .from('publications')
            .select(columns)
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, to)
            .returns<Row[]>(),
        )
      const columns = 'id, kind, title, importance, target_scope, class_offering_id, target_class_name, target_academic_year, target_shift, target_group_department, target_section, created_at, due_at'
      // unpublished_at arrives with migration 0252; read without it until then.
      const withStatus = await load(`${columns}, unpublished_at`)
      return withStatus.error && isMissingColumnError({ message: withStatus.error }) ? load(columns) : withStatus
    })(),
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
  const monthStart = new Date().toISOString().slice(0, 7)
  const count = (pred: (r: Row) => boolean) => fmt.format(rows.filter(pred).length)
  // Newest-first is already the query's order, so the first N of a filter is
  // the most recent — no separate sort needed for the banner/workflow card.
  const needsAttention = rows.filter((r) => r.importance === 'urgent' || r.importance === 'important')
  const urgentRows = rows.filter((r) => r.importance === 'urgent')
  const otherKinds = PUBLICATION_KINDS.filter((k) => k.key !== 'notice')
  const kindCount = (k: PublicationKind) => rows.filter((r) => r.kind === k).length

  const badge = (cls: string, label: string) => (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
  )
  const columns: Column<Row>[] = [
    {
      key: 'title',
      header: t('notices.colTitle', lang),
      card: 'title',
      cell: (r) => (
        <>
          <span className="font-semibold">{r.title}</span>
          {isUnpublished(r.unpublished_at) && (
            <span className="ml-2 inline-flex rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
              {t('notices.unpublishedChip', lang)}
            </span>
          )}
          {r.kind === 'homework' && r.due_at && (
            <span className="block text-xs font-normal text-muted">
              {t('student.taskDue', lang)}: {formatDate(r.due_at, lang)}
            </span>
          )}
        </>
      ),
    },
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
    { key: 'date', header: t('notices.colDate', lang), cell: (r) => formatDate(r.created_at, lang) },
  ]

  return (
    <div className="ui-rows">
      <PageHeader
        icon="notices"
        title={t('notices.title', lang)}
        subtitle={t('notices.pageSubtitle', lang)}
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

      {urgentRows.length > 0 && (
        <WarningBanner
          label={t('notices.statUrgent', lang)}
          text={urgentRows
            .slice(0, 3)
            .map((r) => r.title)
            .join(', ')}
          href="/school/notices?importance=urgent"
          linkLabel={t('notices.view', lang)}
        />
      )}

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
        rowActions={(r) => (
          <RowActionPill state="default" href={withParams(params, { view: r.id })} label={t('notices.view', lang)} />
        )}
        desktopLayout="list"
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <Card>
            <p className="text-sm text-muted">{t('notices.none', lang)}</p>
          </Card>
        }
      />

      <div className="mt-section grid gap-grid lg:grid-cols-2">
        <WorkflowCard icon={<AlertTriangle className="size-5" />} title={t('notices.workflowAttentionTitle', lang)}>
          {needsAttention.length === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('notices.workflowAttentionEmpty', lang)}
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-line">
              {needsAttention.slice(0, 5).map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.title}</p>
                    <p className="text-xs text-muted">{importanceLabel(r.importance, lang)}</p>
                  </div>
                  <RowActionPill state="next" href={withParams(params, { view: r.id })} label={t('notices.view', lang)} />
                </li>
              ))}
            </ul>
          )}
        </WorkflowCard>

        <WorkflowCard icon={<CalendarDays className="size-5" />} title={t('notices.workflowByTypeTitle', lang)}>
          <ul className="mb-4 divide-y divide-line">
            {otherKinds.map((k) => (
              <li key={k.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="font-semibold">
                  {k.label[lang]} · {fmt.format(kindCount(k.key))}
                </p>
                <RowActionPill state="default" href={`/school/notices?kind=${k.key}`} label={t('notices.view', lang)} />
              </li>
            ))}
          </ul>
        </WorkflowCard>
      </div>

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.row.title ?? ''}
        header={viewed && <DrawerHeader name={viewed.row.title} avatarId={viewed.row.id} subtitle={noticeMeta(viewed, lang)} />}
        footer={
          viewed && (
            <DrawerFooter
              cancelHref={noticeDrawerCancelHref(params)}
              cancelLabel={t('routine.cancel', lang)}
              primary={{ href: `/school/notices/${viewed.row.id}`, label: t('table.openFullPage', lang) }}
            />
          )
        }
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && <NoticeDrawerBody notice={viewed} lang={lang} />}
      </RecordDrawer>
    </div>
  )
}
