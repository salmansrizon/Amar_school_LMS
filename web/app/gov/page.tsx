import { TerritorySchools } from '@/components/territory-schools'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getGovContext } from '@/lib/gov/context'

// Gov-official landing on the unified shell (#285). Deeper oversight surface + its
// search/notification sources are #298 / #286 / #287.
export default async function GovHome() {
  const lang = await currentLang()
  const { fullName } = await getGovContext()

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <h1 className="mb-1 text-2xl font-extrabold">{fullName}</h1>
      <p className="mb-4 text-sm text-muted">{t('home.gov', lang)}</p>
      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <TerritorySchools lang={lang} />
      </section>
    </main>
  )
}
