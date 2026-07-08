import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { GenerateBatchForm, DeleteCodeButton } from './code-controls'

export default async function CodesPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'super_admin') redirect('/super-admin')

  const { data: codes } = await supabase
    .from('subscription_codes')
    .select('id, code, validity_months, price, redeemed_at, schools:redeemed_school_id(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('codes.title', lang)}</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← {t('home.superAdmin', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('codes.generate', lang)}</h2>
        <GenerateBatchForm lang={lang} />
      </section>

      <section className="overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase text-muted">
              <th className="py-2">{t('codes.code', lang)}</th>
              <th className="py-2">{t('codes.validity', lang)}</th>
              <th className="py-2">{t('codes.price', lang)}</th>
              <th className="py-2">{t('codes.status', lang)}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
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
      </section>
    </main>
  )
}
