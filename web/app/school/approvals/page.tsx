import { paginate, pageSizeFrom } from '@/components/pager'
import Link from 'next/link'
import { Hourglass, ListChecks, Timer } from 'lucide-react'
import { getSchoolContext } from '@/lib/school/context'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, formatDate } from '@/lib/i18n'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid, WorkflowCard } from '@/components/ui/widgets'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { RowActionPill } from '@/components/data-table/row-action-pill'
import { withParams } from '@/lib/url-params'
import { DrawerFooter, DrawerHeader } from '@/components/data-table/drawer-parts'
import { ApprovalDrawerBody, approvalDrawerCancelHref } from './approval-drawer'
import { pageTitle } from '@/lib/page-title'
import { pendingApprovalsInReach } from '@/lib/school/approvals-reach'

type Labelled = { label?: { en?: string; bn?: string } | null }
type Instance = { id: string; definition_key: string; entity_type: string; entity_id: string; current_seq: number; created_at: string }

// School approvals inbox (#317), following the exam-landing pattern (013
// FC4/013 A3): header + subtitle, stat cards, a Type quick-filter, the
// DataTable (title opens the drawer, one "Decide" pill per row — deciding is
// the only action a row has, so nothing hides behind a ⋮), then two workflow
// cards — the oldest waiting instances and the queue split by workflow type.
// In-progress workflow instances for the tenant; the current stage's approver
// acts via workflow_decide (RPC-enforced). RLS scopes the list to the school,
// and lib/school/approvals-reach.ts narrows it to the caller's reach (#689). There is no meaningful sub-view to point a
// warning banner at — the table below already is the whole queue — so this
// page has none, unlike the other section landings.
export const generateMetadata = pageTitle('approvals.title')

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; type?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const { supabase, role, userId, grants } = await getSchoolContext()
  const lang = await currentLang()
  const fmt = numberFmt(lang)

  // #689: only the instances in the caller's reach (the Owner: all of them).
  const [instances, { data: defs }]: [Instance[], { data: { key: string }[] | null }] = await Promise.all([
    pendingApprovalsInReach(supabase, { role, userId, grants }),
    supabase.from('workflow_definitions').select('key, label'),
  ])
  const label = new Map(
    (defs ?? []).map((d) => {
      const l = (d as Labelled).label
      return [d.key, (lang === 'bn' ? l?.bn : undefined) ?? l?.en ?? d.key]
    }),
  )
  const name = (i: Instance) => label.get(i.definition_key) ?? i.definition_key
  const date = (i: Instance) => formatDate(i.created_at, lang)
  const viewed = params.view ? (instances.find((i) => i.id === params.view) ?? null) : null
  const filtered = params.type ? instances.filter((i) => i.definition_key === params.type) : instances
  const pageSize = pageSizeFrom(params.size, 20)
  const pageData = paginate(filtered, params.page, pageSize)

  // Oldest-first (the fetch itself is newest-first for the table's default
  // read order), and the distinct workflow types currently waiting — both
  // folded from the one query above, no second read.
  const oldest = instances.length ? instances[instances.length - 1] : null
  const oldestDays = oldest ? Math.floor((new Date().getTime() - new Date(oldest.created_at).getTime()) / 86_400_000) : 0
  const types = [...new Set(instances.map((i) => i.definition_key))]
  const typeLabel = (key: string) => label.get(key) ?? key
  const byOldest = [...instances].reverse()

  const columns: Column<Instance>[] = [
    {
      key: 'workflow',
      header: t('approvals.colWorkflow', lang),
      card: 'title',
      cell: (i) => (
        <Link
          href={withParams(params, { view: i.id })}
          scroll={false}
          data-view-link={i.id}
          className="font-semibold hover:text-brand-600 hover:underline"
        >
          {name(i)}
        </Link>
      ),
    },
    { key: 'entity', header: t('approvals.colEntity', lang), cell: (i) => i.entity_type },
    { key: 'stage', header: t('approvals.colStage', lang), align: 'right', cell: (i) => fmt.format(i.current_seq) },
    { key: 'date', header: t('notices.colDate', lang), cell: date },
  ]

  return (
    <>
      <PageHeader
        icon="approvals"
        title={t('approvals.title', lang)}
        subtitle={t('approvals.pageSubtitle', lang)}
        crumbs={schoolCrumbs('/school/approvals', lang, [{ label: t('approvals.title', lang) }])}
        badge={`${t('pager.total', lang)}: ${fmt.format(instances.length)}`}
      />

      <StatGrid>
        <StatCard icon={<Hourglass className="size-5" />} tone="sun" label={t('approvals.statPending', lang)} value={fmt.format(instances.length)} />
        <StatCard
          icon={<Timer className="size-5" />}
          tone={oldestDays > 2 ? 'alert' : 'muted'}
          label={t('approvals.statOldest', lang)}
          value={oldest ? `${fmt.format(oldestDays)} ${t('approvals.daysWord', lang)}` : '—'}
          note={oldest ? name(oldest) : undefined}
          noteTone="muted"
        />
        <StatCard icon={<ListChecks className="size-5" />} tone="sky" label={t('approvals.statTypes', lang)} value={fmt.format(types.length)} />
      </StatGrid>

      <DataTable
        rows={pageData.items}
        rowId={(i) => i.id}
        rowLabel={name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('approvals.title', lang)}
        filters={[{ param: 'type', label: t('approvals.colWorkflow', lang), options: types.map((k) => ({ value: k, label: typeLabel(k) })) }]}
        rowActions={(i) => (
          <RowActionPill state="next" href={withParams(params, { view: i.id })} label={t('approvals.decide', lang)} />
        )}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <Card>
            <p className="text-sm text-muted">{t('approvals.none', lang)}</p>
          </Card>
        }
      />

      <div className="mt-section grid gap-grid lg:grid-cols-2">
        <WorkflowCard icon={<Timer className="size-5" />} title={t('approvals.workflowOldestTitle', lang)}>
          {byOldest.length === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('approvals.none', lang)}
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-line">
              {byOldest.slice(0, 5).map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{name(i)}</p>
                    <p className="text-xs text-muted">
                      {i.entity_type} · {date(i)}
                    </p>
                  </div>
                  <RowActionPill state="next" href={withParams(params, { view: i.id })} label={t('approvals.decide', lang)} />
                </li>
              ))}
            </ul>
          )}
        </WorkflowCard>

        <WorkflowCard icon={<ListChecks className="size-5" />} title={t('approvals.workflowByTypeTitle', lang)}>
          {types.length === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('approvals.none', lang)}
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-line">
              {types.map((key) => (
                <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="font-semibold">
                    {typeLabel(key)} · {fmt.format(instances.filter((i) => i.definition_key === key).length)}
                  </p>
                  <RowActionPill state="default" href={withParams(params, { type: key })} label={t('notices.view', lang)} />
                </li>
              ))}
            </ul>
          )}
        </WorkflowCard>
      </div>

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed ? name(viewed) : ''}
        header={viewed && <DrawerHeader name={name(viewed)} avatarId={viewed.id} subtitle={date(viewed)} />}
        footer={viewed && <DrawerFooter cancelHref={approvalDrawerCancelHref(params)} cancelLabel={t('routine.cancel', lang)} />}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <ApprovalDrawerBody
            entityType={viewed.entity_type}
            stage={viewed.current_seq}
            date={date(viewed)}
            instanceId={viewed.id}
            lang={lang}
          />
        )}
      </RecordDrawer>
    </>
  )
}
