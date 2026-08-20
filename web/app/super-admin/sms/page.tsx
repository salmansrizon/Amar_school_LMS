import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { buildTree, LOCATION_LABEL, type LocationNode, type LocationRow } from '@/lib/locations'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { SCHOOL_RECIPIENT_COLUMNS, type SchoolRecipientRow } from '@/lib/super-admin/school-recipients'
import { SmsComposer, type LocationOption } from './sms-composer'

// Super-admin SMS to schools (map #158, ticket #165). The composer previews the
// recipient count with the same pure helper the send action uses, so the shown
// count is the sent count.
export default async function SuperAdminSmsPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const [{ data: schools }, { data: locations }, { data: clusters }] = await Promise.all([
    supabase.from('schools').select(SCHOOL_RECIPIENT_COLUMNS).order('name'),
    supabase.from('locations').select('id, name, type, parent_id').order('name'),
    supabase.from('clusters').select('id, location_id'),
  ])

  // Flatten the location tree into an indented, ordered option list.
  const options: LocationOption[] = []
  const walk = (nodes: LocationNode[], depth: number) => {
    for (const n of nodes) {
      options.push({ id: n.id, label: `${LOCATION_LABEL[n.type][lang]} — ${n.name}`, depth })
      walk(n.children, depth + 1)
    }
  }
  walk(buildTree((locations ?? []) as LocationRow[]), 0)

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sa.sms.title', lang)}</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← {t('sa.nav.dashboard', lang)}
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5">
        <SmsComposer
          locationOptions={options}
          schools={(schools ?? []) as SchoolRecipientRow[]}
          locations={(locations ?? []).map((l) => ({ id: l.id, parent_id: l.parent_id }))}
          clusters={(clusters ?? []).map((c) => ({ id: c.id, location_id: c.location_id }))}
          lang={lang}
        />
      </section>
    </main>
  )
}
