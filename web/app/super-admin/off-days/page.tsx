import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { AddCentralOffDayForm, DeleteCentralOffDayButton } from './off-day-controls'

// Central off-day calendar (map #158, ticket #166): super-admin authors the
// yearly holiday template; schools import it from /school/attendance/off-days.
export default async function CentralOffDaysPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const { data: offDays } = await supabase
    .from('central_off_days')
    .select('id, day, label_bn, label_en, year')
    .order('day')

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sa.offday.title', lang)}</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← {t('sa.nav.dashboard', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('sa.offday.add', lang)}</h2>
        <AddCentralOffDayForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {!offDays?.length ? (
          <p className="text-sm text-muted">{t('sa.offday.none', lang)}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {offDays.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-mono">{o.day}</span>
                  {(o.label_bn || o.label_en) && (
                    <span className="ml-2 text-muted">
                      {lang === 'bn' ? (o.label_bn ?? o.label_en) : (o.label_en ?? o.label_bn)}
                    </span>
                  )}
                </span>
                <DeleteCentralOffDayButton id={o.id} lang={lang} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
