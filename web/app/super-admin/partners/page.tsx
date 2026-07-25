import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { CreateVendorForm } from './create-vendor-form'

export default async function PartnersPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  // Dealers only — Government Officials have their own surface (#164).
  const { data: partners } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('role', 'dealer')
    .order('created_at')

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sa.nav.dealers', lang)}</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← {t('home.superAdmin', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('partners.create', lang)}</h2>
        <CreateVendorForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('partners.list', lang)}</h2>
        <ul className="divide-y divide-line">
          {partners?.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span className="text-sm font-medium">
                {p.full_name ?? p.id}{' '}
                <span className="ml-1 rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
                  {t('partners.dealer', lang)}
                </span>
              </span>
              <Link
                href={`/super-admin/partners/${p.id}`}
                className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
              >
                {t('partners.assignments', lang)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
