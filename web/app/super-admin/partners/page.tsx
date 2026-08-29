import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { PageHeader, SectionCard } from '@/components/super-admin/dashboard-ui'
import { CreateVendorForm } from './create-vendor-form'
import { DistributorList, type DistributorRow } from './distributor-list'
import { DistributorDetail } from './distributor-detail'

// Distributor master-detail (#416/#418, reference image-1.png): searchable
// account list (left) + the selected distributor's FULL profile (right), driven
// by ?selected=<id>. All distributor sections + edit controls live in the right
// pane — there is no dedicated profile route.
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

        {/* Right: the selected distributor's full profile (all sections, editable) */}
        <div>
          {selectedId ? (
            <DistributorDetail id={selectedId} lang={lang} />
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
