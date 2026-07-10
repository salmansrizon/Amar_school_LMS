import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { FeeStructureForm, CopyFeeStructureForm, type ClassOption } from './structure-controls'

// Layout per ui/school-owner/fee-structures.html: toolbar (+ New Fee Structure)
// over a Class | Year | Fee Type | Amount | Action table; the mockup's
// copy-to-another-class/year dialog is reproduced as a per-row disclosure
// (this app's established pattern — see classes.AddDetails — rather than a
// client-side modal component, per the ADR 0007 "no extra client machinery"
// spirit already used for print).

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

function feeTypeBadge(feeType: string, lang: Lang) {
  const isMonthly = feeType === 'monthly'
  const tone = isMonthly ? 'bg-brand-100 text-brand-700' : 'bg-paper-muted text-muted'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {t(isMonthly ? 'fees.monthly' : 'fees.oneTimeYearly', lang)}
    </span>
  )
}

export default async function FeeStructuresPage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: classes }, { data: structures }] = await Promise.all([
    supabase.from('classes').select('id, name, section').order('created_at'),
    supabase
      .from('fee_structures')
      .select('id, academic_year, fee_type, amount, fine_per_absent_day, class_id, classes(name, section)')
      .order('academic_year', { ascending: false }),
  ])

  const classOptions: ClassOption[] = classes ?? []
  const classLabel = (c: { name: string; section: string | null } | null) =>
    c ? `${c.name}${c.section ? ` - ${c.section}` : ''}` : '—'

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('fees.tabStructures', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <nav className="mb-4 flex gap-2 border-b border-line text-sm font-semibold">
        <span className="border-b-2 border-brand-500 px-3 py-2 text-brand-700">
          {t('fees.tabStructures', lang)}
        </span>
        <Link href="/school/fees" className="px-3 py-2 text-muted hover:text-ink">
          {t('fees.tabCollection', lang)}
        </Link>
      </nav>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('fees.newStructure', lang)}</h2>
        {!classOptions.length ? (
          <p className="text-sm text-muted">{t('routine.noClasses', lang)}</p>
        ) : (
          <FeeStructureForm classes={classOptions} lang={lang} />
        )}
      </section>

      <section className="overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('fees.tabStructures', lang)}</h2>
        {!structures?.length ? (
          <p className="text-sm text-muted">{t('fees.noStructures', lang)}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('fees.class', lang)}</th>
                <th className={thClass}>{t('fees.academicYear', lang)}</th>
                <th className={thClass}>{t('fees.feeType', lang)}</th>
                <th className={thClass}>{t('fees.amount', lang)}</th>
                <th className={thClass}>{t('fees.finePerDay', lang)}</th>
                <th className={thClass}>{t('fees.action', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {structures.map((s) => {
                const cls = s.classes as unknown as { name: string; section: string | null } | null
                return (
                  <tr key={s.id} className="border-b border-line align-top">
                    <td className={`${tdClass} font-medium`}>{classLabel(cls)}</td>
                    <td className={tdClass}>{s.academic_year}</td>
                    <td className={tdClass}>{feeTypeBadge(s.fee_type, lang)}</td>
                    <td className={tdClass}>৳{Number(s.amount)}</td>
                    <td className={tdClass}>৳{Number(s.fine_per_absent_day)}</td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-2">
                        <details className="group">
                          <summary className="inline-flex cursor-pointer list-none rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted">
                            {t('fees.edit', lang)}
                          </summary>
                          <div className="mt-3 min-w-72 rounded-md border border-line bg-paper-muted p-4">
                            <FeeStructureForm
                              classes={classOptions}
                              lang={lang}
                              editing={{
                                id: s.id,
                                class_id: s.class_id,
                                academic_year: s.academic_year,
                                fee_type: s.fee_type as 'monthly' | 'one_time_yearly',
                                amount: Number(s.amount),
                                fine_per_absent_day: Number(s.fine_per_absent_day),
                              }}
                            />
                          </div>
                        </details>
                        <details className="group">
                          <summary className="inline-flex cursor-pointer list-none rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted">
                            {t('fees.copy', lang)}
                          </summary>
                          <div className="mt-3 min-w-72 rounded-md border border-line bg-paper-muted p-4">
                            <p className="mb-3 text-xs text-muted">{t('fees.copyTitle', lang)}</p>
                            <CopyFeeStructureForm sourceId={s.id} classes={classOptions} lang={lang} />
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
