import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { sortCocurricularItems } from '@/lib/cocurricular'
import { AddCocurricularItemForm, CocurricularItemsList } from './controls'

// Settings screen for the school-defined co-curricular activity list backing
// the progress report's Co-curricular Checklist section (issue #33,
// migration 0052) — the mockups don't show a management screen for this (no
// existing data model to reuse), so this follows the grading-schemes /
// combinations settings-page pattern already established in this module.

export default async function CocurricularItemsPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: items } = await supabase.from('cocurricular_items').select('id, label, sort_order')

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('cocurricular.itemsTitle', lang)}</h1>
        <Link href="/school/exams" className="text-sm text-brand-600 hover:underline">
          ← {t('exams.title', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <AddCocurricularItemForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <CocurricularItemsList items={sortCocurricularItems(items ?? [])} lang={lang} />
      </section>
    </main>
  )
}
