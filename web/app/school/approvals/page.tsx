import { Hourglass } from 'lucide-react'
import { getSchoolContext } from '@/lib/school/context'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt } from '@/lib/i18n'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { DecideControls } from './decide-controls'

type Labelled = { label?: { en?: string; bn?: string } | null }
type Instance = { id: string; definition_key: string; entity_type: string; entity_id: string; current_seq: number; created_at: string }

// School approvals inbox (#317), on the DataTable with a drawer to decide (map
// 013 FC4). In-progress workflow instances for the tenant; the current stage's
// approver acts via workflow_decide (RPC-enforced). RLS ("members read own
// instances") scopes the list to the school.
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams
  const { supabase } = await getSchoolContext()
  const lang = await currentLang()
  const fmt = numberFmt(lang)

  const [{ data }, { data: defs }] = await Promise.all([
    supabase
      .from('workflow_instances')
      .select('id, definition_key, entity_type, entity_id, current_seq, created_at')
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false }),
    supabase.from('workflow_definitions').select('key, label'),
  ])
  const instances = (data ?? []) as Instance[]
  const label = new Map(
    (defs ?? []).map((d) => {
      const l = (d as Labelled).label
      return [d.key, (lang === 'bn' ? l?.bn : undefined) ?? l?.en ?? d.key]
    }),
  )
  const name = (i: Instance) => label.get(i.definition_key) ?? i.definition_key
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const date = (i: Instance) => new Date(i.created_at).toLocaleDateString(locale)
  const viewed = params.view ? (instances.find((i) => i.id === params.view) ?? null) : null

  const columns: Column<Instance>[] = [
    { key: 'workflow', header: t('approvals.colWorkflow', lang), card: 'title', cell: (i) => <span className="font-semibold">{name(i)}</span> },
    { key: 'entity', header: t('approvals.colEntity', lang), cell: (i) => i.entity_type },
    { key: 'stage', header: t('approvals.colStage', lang), align: 'right', cell: (i) => fmt.format(i.current_seq) },
    { key: 'date', header: t('notices.colDate', lang), cell: date },
  ]

  return (
    <>
      <PageHeader
        title={t('approvals.title', lang)}
        crumbs={schoolCrumbs('/school/approvals', lang, [{ label: t('approvals.title', lang) }])}
        badge={`${t('pager.total', lang)}: ${fmt.format(instances.length)}`}
      />

      <StatGrid>
        <StatCard icon={<Hourglass className="size-5" />} tone="sun" label={t('approvals.statPending', lang)} value={fmt.format(instances.length)} />
      </StatGrid>

      <DataTable
        rows={instances}
        rowId={(i) => i.id}
        rowLabel={name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('approvals.title', lang)}
        rowActions={(i) => <ViewLink id={i.id} params={params} label={t('approvals.decide', lang)} name={name(i)} />}
        empty={
          <Card>
            <p className="text-sm text-muted">{t('approvals.none', lang)}</p>
          </Card>
        }
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed ? name(viewed) : ''}
        subtitle={viewed ? `${viewed.entity_type} · ${t('approvals.colStage', lang)} ${fmt.format(viewed.current_seq)} · ${date(viewed)}` : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && <DecideControls instanceId={viewed.id} lang={lang} />}
      </RecordDrawer>
    </>
  )
}
