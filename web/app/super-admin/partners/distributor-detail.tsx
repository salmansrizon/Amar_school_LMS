import { type LocationRow } from '@/lib/locations'
import { t, type Lang } from '@/lib/i18n'
import { formatTaka } from '@/lib/money'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { distributorKpis } from '@/lib/super-admin/distributor-view'
import { SectionCard, KpiCard } from '@/components/super-admin/dashboard-ui'
import { EntityAvatar } from '@/components/entity-avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AddAssignmentForm } from './[id]/assignment-controls'
import { AssignmentList, type AssignmentRow } from './[id]/assignment-list'
import { StatusControls } from './[id]/status-controls'

const STATUS_PILL: Record<string, string> = {
  active: 'bg-mint-soft text-mint-deep',
  approved: 'bg-mint-soft text-mint-deep',
  pending: 'bg-sun-soft text-sun-deep',
  under_review: 'bg-sun-soft text-sun-deep',
  suspended: 'bg-alert-soft text-alert-deep',
  blocked: 'bg-alert-soft text-alert-deep',
}

type ActivityRow = { entity_type: string; entity_id: string; action: string; created_at: string }

// The full distributor profile, self-fetching from its id — rendered inside the
// master-detail right pane on /super-admin/partners (#418). Every distributor
// section lives here (KPIs + KYC/status/territory/activity, with the edit
// controls inline); there is no dedicated profile route any more.
export async function DistributorDetail({ id, lang }: { id: string; lang: Lang }) {
  const { supabase } = await getSuperAdminContext()

  const { data: partner } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', id)
    .eq('role', 'distributor')
    .single()
  if (!partner) {
    return (
      <SectionCard>
        <p className="py-12 text-center text-sm text-muted">Distributor not found.</p>
      </SectionCard>
    )
  }

  const [
    { data: assignments },
    { data: locations },
    { data: schools },
    { data: profile },
    { data: commissions },
    { count: agentsCount },
    { data: activity },
  ] = await Promise.all([
    supabase
      .from('territory_assignments')
      .select('id, tier, locations(name, type), schools(name)')
      .eq('assignee_id', id)
      .order('created_at'),
    supabase.from('locations').select('id, name, type, parent_id').order('name'),
    supabase.from('schools').select('id, name').order('name'),
    supabase
      .from('distributor_profiles')
      .select('trade_license, nid, bank_details, agreement_status, agreement_signed_at, status')
      .eq('profile_id', id)
      .maybeSingle(),
    supabase.from('commissions').select('commission_amount, status').eq('distributor_id', id),
    supabase.from('agent_assignments').select('*', { count: 'exact', head: true }).eq('distributor_id', id),
    supabase
      .from('audit_log')
      .select('entity_type, entity_id, action, created_at')
      .eq('entity_type', 'distributor')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const status = profile?.status ?? 'pending'
  const assignmentRows = (assignments ?? []) as AssignmentRow[]
  const activityRows = (activity ?? []) as ActivityRow[]
  const schoolsCount = assignmentRows.filter((a) => a.schools).length
  const kpis = distributorKpis((commissions ?? []) as { commission_amount: number; status: string }[])
  const agreement = `${profile?.agreement_status ?? 'pending'}${
    profile?.agreement_signed_at ? ` · ${new Date(profile.agreement_signed_at).toLocaleDateString('en-GB')}` : ''
  }`
  const hasBank = !!(profile?.bank_details && Object.keys(profile.bank_details).length)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <SectionCard>
        <div className="flex flex-wrap items-center gap-3">
          <EntityAvatar name={partner.full_name ?? '?'} id={partner.id} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-extrabold text-ink">{partner.full_name ?? partner.id}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_PILL[status] ?? 'bg-paper-muted text-muted'}`}>
                {status}
              </span>
            </div>
            <p className="truncate text-sm text-muted">{t('partners.distributor', lang)}</p>
          </div>
        </div>
      </SectionCard>

      {/* KPI tiles — all real data (revenue/notes have no source, omitted) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Schools" value={schoolsCount} tone="brand" />
        <KpiCard label="Agents" value={agentsCount ?? 0} tone="green" />
        <KpiCard label="Commission" value={formatTaka(kpis.commissionTotal)} tone="amber" />
        <KpiCard label="Pending Settlement" value={formatTaka(kpis.pendingSettlement)} tone="rose" />
      </div>

      {/* flex-col: the shared Tabs primitive's data-horizontal:flex-col variant
          is undefined in this repo's globals, so force the stack here. */}
      <Tabs defaultValue="overview" className="flex-col">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="kyc">KYC &amp; Agreement</TabsTrigger>
          <TabsTrigger value="territory">Territory</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <SectionCard title="At a glance">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Fact label="Status" value={status} />
              <Fact label="Agreement" value={agreement} />
              <Fact label={t('partners.assignments', lang)} value={String(assignmentRows.length)} />
              <Fact label="Schools" value={String(schoolsCount)} />
            </dl>
          </SectionCard>
        </TabsContent>

        <TabsContent value="kyc" className="mt-3">
          <SectionCard title="KYC & lifecycle">
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Fact label="Trade license" value={profile?.trade_license ?? '—'} />
              <Fact label="NID" value={profile?.nid ?? '—'} />
              <Fact label="Agreement" value={agreement} />
              <Fact label="Bank" value={hasBank ? 'Set' : '—'} />
            </dl>
            {profile ? (
              <StatusControls distributor={partner.id} current={profile.status} />
            ) : (
              <p className="text-sm text-muted">No distributor profile record.</p>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="territory" className="mt-3">
          <SectionCard title={t('partners.assignments', lang)}>
            <div className="mb-4">
              <AddAssignmentForm
                assigneeId={partner.id}
                isDistributor={partner.role === 'distributor'}
                locations={(locations ?? []) as LocationRow[]}
                schools={schools ?? []}
                lang={lang}
              />
            </div>
            <AssignmentList assignments={assignmentRows} assigneeId={partner.id} lang={lang} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="activity" className="mt-3">
          <SectionCard title="Recent activity">
            {activityRows.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {activityRows.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 border-b border-line/70 pb-2 text-sm last:border-0 last:pb-0">
                    <span className="font-medium text-ink">
                      {a.action} · {a.entity_type}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{new Date(a.created_at).toLocaleString('en-GB')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted">No activity yet.</p>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper-muted px-3 py-2">
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd className="truncate text-sm font-bold text-ink">{value}</dd>
    </div>
  )
}
