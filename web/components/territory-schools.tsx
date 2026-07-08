import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

// The assignee's aggregated Schools list — shared by Dealer and Gov Official
// homes. Extended-access Schools are always visibly flagged (CONTEXT.md).
export async function TerritorySchools({ lang }: { lang: Lang }) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('my_territory_schools')
  const schools = (data ?? []) as { school_id: string; name: string; is_extended: boolean }[]

  return (
    <div className="mt-4 text-left">
      <h2 className="mb-2 text-sm font-bold text-muted">{t('territory.mySchools', lang)}</h2>
      {schools.length === 0 && <p className="text-sm text-muted">{t('territory.noSchools', lang)}</p>}
      <ul className="divide-y divide-line">
        {schools.map((s) => (
          <li key={s.school_id} className="flex items-center justify-between py-2 text-sm">
            <span className="font-medium">{s.name}</span>
            {s.is_extended && (
              <span className="rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">
                {t('territory.extended', lang)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
