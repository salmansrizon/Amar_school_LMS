import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { FeeForm } from './fee-form'

export default async function FeesPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: students }, { data: records }] = await Promise.all([
    supabase.from('students').select('id, full_name, class_name').order('full_name'),
    supabase
      .from('fee_collection_records')
      .select('id, month, year, pay_amount, fine_amount, adjust_amount, due_amount, payment_method, students(full_name)')
      .order('updated_at', { ascending: false })
      .limit(50),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('fees.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('fees.collect', lang)}</h2>
        <FeeForm students={students ?? []} lang={lang} />
      </section>

      <section className="overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('fees.records', lang)}</h2>
        {!records?.length && <p className="text-sm text-muted">{t('fees.none', lang)}</p>}
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {records?.map((r) => (
              <tr key={r.id}>
                <td className="py-2 font-medium">
                  {(r.students as unknown as { full_name: string } | null)?.full_name}
                </td>
                <td className="py-2 text-muted">
                  {r.month}/{r.year}
                </td>
                <td className="py-2">৳{Number(r.pay_amount)}</td>
                <td className="py-2 text-muted">
                  {t('fees.due', lang)}: ৳{Number(r.due_amount)}
                </td>
                <td className="py-2 text-right">
                  <Link
                    href={`/school/fees/receipt/${r.id}`}
                    className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                  >
                    {t('fees.receipt', lang)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
