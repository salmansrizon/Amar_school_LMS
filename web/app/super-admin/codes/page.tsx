import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { PageHeader, SectionCard } from '@/components/super-admin/dashboard-ui'
import { GenerateBatchForm, DeleteCodeButton } from './code-controls'

// Subscription-code registry (restyled to the T1 design language, map #171 T10 —
// cosmetic only, controls unchanged).
export default async function CodesPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const { data: codes } = await supabase
    .from('subscription_codes')
    .select('id, code, validity_months, price, redeemed_at, schools:redeemed_school_id(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t('codes.title', lang)}
        actions={
          <Link href="/super-admin" className="text-sm font-semibold text-brand-600 hover:underline">
            ← {t('home.superAdmin', lang)}
          </Link>
        }
      />

      <section className="mt-6">
        <SectionCard title={t('codes.generate', lang)}>
          <GenerateBatchForm lang={lang} />
        </SectionCard>
      </section>

      <section className="mt-4">
        <SectionCard bodyClassName="overflow-x-auto p-4 sm:p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/70 text-left text-xs font-semibold uppercase text-muted">
                <th className="py-2">{t('codes.code', lang)}</th>
                <th className="py-2">{t('codes.validity', lang)}</th>
                <th className="py-2">{t('codes.price', lang)}</th>
                <th className="py-2">{t('codes.status', lang)}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {codes?.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 font-mono font-semibold">{c.code}</td>
                  <td className="py-2">{c.validity_months}m</td>
                  <td className="py-2">৳{Number(c.price)}</td>
                  <td className="py-2">
                    {c.redeemed_at ? (
                      <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
                        {t('codes.used', lang)} — {(c.schools as unknown as { name: string } | null)?.name}
                      </span>
                    ) : (
                      <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
                        {t('codes.unused', lang)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {!c.redeemed_at && <DeleteCodeButton id={c.id} label={t('codes.delete', lang)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </section>
    </main>
  )
}
