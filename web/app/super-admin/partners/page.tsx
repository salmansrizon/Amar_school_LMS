import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { PageHeader, SectionCard } from '@/components/super-admin/dashboard-ui'
import { EntityAvatar } from '@/components/entity-avatar'
import { ButtonLink } from '@/components/ui/button'
import { CreateVendorForm } from './create-vendor-form'
import { DistributorList, type DistributorRow } from './distributor-list'

const STATUS_PILL: Record<string, string> = {
  active: 'bg-mint-soft text-mint-deep',
  approved: 'bg-mint-soft text-mint-deep',
  pending: 'bg-sun-soft text-sun-deep',
  under_review: 'bg-sun-soft text-sun-deep',
  suspended: 'bg-alert-soft text-alert-deep',
  blocked: 'bg-alert-soft text-alert-deep',
}

// Distributor master-detail (#416, reference image-1.png): searchable account
// list on the left, the selected distributor's summary pane on the right, driven
// by ?selected=<id> (server-rendered — no client fetch).
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string }>
}) {
  const lang = await currentLang()
  const { selected } = await searchParams
  const { supabase } = await getSuperAdminContext()

  // Distributors only — Government Officials have their own surface (#164).
  const { data: partners } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('role', 'distributor')
    .order('created_at')
  const list = (partners ?? []) as DistributorRow[]
  const selectedId = selected ?? list[0]?.id ?? null
  const selectedRow = list.find((d) => d.id === selectedId) ?? null

  let profile: {
    trade_license: string | null
    nid: string | null
    agreement_status: string | null
    status: string
  } | null = null
  let territoryCount = 0
  let agentCount = 0
  if (selectedId) {
    const [{ data: p }, { count: tc }, { count: ac }] = await Promise.all([
      supabase
        .from('distributor_profiles')
        .select('trade_license, nid, agreement_status, status')
        .eq('profile_id', selectedId)
        .maybeSingle(),
      supabase.from('territory_assignments').select('*', { count: 'exact', head: true }).eq('assignee_id', selectedId),
      supabase.from('agent_assignments').select('*', { count: 'exact', head: true }).eq('distributor_id', selectedId),
    ])
    profile = p
    territoryCount = tc ?? 0
    agentCount = ac ?? 0
  }
  const status = profile?.status ?? 'pending'

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t('sa.nav.distributors', lang)}
        actions={
          <Link href="/super-admin" className="text-sm font-semibold text-brand-600 hover:underline">
            ← {t('home.superAdmin', lang)}
          </Link>
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        {/* Left: create + searchable account list */}
        <div className="flex flex-col gap-4">
          <SectionCard title={t('partners.create', lang)}>
            <CreateVendorForm lang={lang} />
          </SectionCard>
          <SectionCard title={t('partners.list', lang)} bodyClassName="p-2 sm:p-3">
            <DistributorList distributors={list} selectedId={selectedId} lang={lang} />
          </SectionCard>
        </div>

        {/* Right: selected distributor summary */}
        <div>
          {selectedRow ? (
            <SectionCard>
              <div className="flex flex-wrap items-center gap-3">
                <EntityAvatar name={selectedRow.full_name ?? '?'} id={selectedRow.id} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-extrabold text-ink">{selectedRow.full_name ?? selectedRow.id}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_PILL[status] ?? 'bg-paper-muted text-muted'}`}>
                      {status}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted">{t('partners.distributor', lang)}</p>
                </div>
                <ButtonLink href={`/super-admin/partners/${selectedRow.id}`} size="sm" variant="secondary">
                  {t('partners.viewProfile', lang)} →
                </ButtonLink>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Fact label="Agreement" value={profile?.agreement_status ?? 'pending'} />
                <Fact label="Trade license" value={profile?.trade_license ?? '—'} />
                <Fact label="NID" value={profile?.nid ?? '—'} />
                <Fact label={t('partners.assignments', lang)} value={String(territoryCount)} />
                <Fact label="Agents" value={String(agentCount)} />
              </dl>
            </SectionCard>
          ) : (
            <SectionCard>
              <p className="py-12 text-center text-sm text-muted">—</p>
            </SectionCard>
          )}
        </div>
      </div>
    </main>
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
