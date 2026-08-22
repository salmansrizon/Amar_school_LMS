import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { PageHeader, SectionCard } from '@/components/super-admin/dashboard-ui'
import { EntityAvatar } from '@/components/entity-avatar'
import { Pager, paginate } from '@/components/pager'
import { CreateVendorForm } from './create-vendor-form'

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const lang = await currentLang()
  const { page: pageParam } = await searchParams
  const { supabase } = await getSuperAdminContext()

  // Distributors only — Government Officials have their own surface (#164).
  const { data: partners } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('role', 'distributor')
    .order('created_at')
  const { page, totalPages, total, items } = paginate(partners ?? [], pageParam, 10)

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

      <section className="mt-6">
        <SectionCard title={t('partners.create', lang)}>
          <CreateVendorForm lang={lang} />
        </SectionCard>
      </section>

      <section className="mt-4">
        <SectionCard title={t('partners.list', lang)} bodyClassName="p-2 sm:p-3">
          {items.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {items.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/super-admin/partners/${p.id}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-paper-muted"
                  >
                    <EntityAvatar name={p.full_name ?? '?'} id={p.id} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{p.full_name ?? p.id}</span>
                      <span className="mt-0.5 inline-block rounded-full bg-sky-soft px-2 py-0.5 text-[11px] font-semibold text-sky-deep">
                        {t('partners.distributor', lang)}
                      </span>
                    </span>
                    <span className="text-muted" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-8 text-center text-sm text-muted">—</p>
          )}
          <Pager page={page} totalPages={totalPages} total={total} lang={lang} />
        </SectionCard>
      </section>
    </main>
  )
}
