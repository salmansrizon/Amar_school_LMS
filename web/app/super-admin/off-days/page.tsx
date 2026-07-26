import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { PageHeader, SectionCard } from '@/components/super-admin/dashboard-ui'
import { AddCentralOffDayForm, DeleteCentralOffDayButton } from './off-day-controls'

// Central off-day calendar (map #158, ticket #166): super-admin authors the
// yearly holiday template; schools import it from /school/attendance/off-days.
// Restyled to the T1 design language (map #171 T10 — cosmetic only).
export default async function CentralOffDaysPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const { data: offDays } = await supabase
    .from('central_off_days')
    .select('id, day, label_bn, label_en, year')
    .order('day')

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t('sa.offday.title', lang)}
        actions={
          <Link href="/super-admin" className="text-sm font-semibold text-brand-600 hover:underline">
            ← {t('sa.nav.dashboard', lang)}
          </Link>
        }
      />

      <section className="mt-6">
        <SectionCard title={t('sa.offday.add', lang)}>
          <AddCentralOffDayForm lang={lang} />
        </SectionCard>
      </section>

      <section className="mt-4">
        <SectionCard bodyClassName={offDays?.length ? 'p-0' : 'p-4 sm:p-5'}>
          {!offDays?.length ? (
            <p className="text-sm text-muted">{t('sa.offday.none', lang)}</p>
          ) : (
            <ul className="divide-y divide-line/70 text-sm">
              {offDays.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
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
        </SectionCard>
      </section>
    </main>
  )
}
