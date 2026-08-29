import { TerritorySchools } from '@/components/territory-schools'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getGovContext } from '@/lib/gov/context'

// Gov-official oversight landing (#298) on the unified shell. Territory KPIs +
// the reachable-schools list (my_territory_schools, RLS/definer-scoped). Search
// source = territory schools (#304 gov branch); notifications via the shell bell.
export default async function GovHome() {
  const lang = await currentLang()
  const { supabase, fullName } = await getGovContext()

  const { data: schools } = await supabase.rpc('my_territory_schools')
  const total = (schools ?? []).length
  const extended = (schools ?? []).filter((s: { is_extended?: boolean }) => s.is_extended).length

  const stats = [
    { label: t('gov.kpi.schools', lang), value: total },
    { label: t('gov.kpi.extended', lang), value: extended },
  ]

  return (
    <main className="w-full p-6">
      <h1 className="mb-1 text-2xl font-extrabold">{fullName}</h1>
      <p className="mb-4 text-sm text-muted">{t('home.gov', lang)}</p>

      <section className="mb-6 grid max-w-md grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-line bg-paper p-4">
            <div className="text-2xl font-extrabold text-brand-700">{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <TerritorySchools lang={lang} />
      </section>
    </main>
  )
}
