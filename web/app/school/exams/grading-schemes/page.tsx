import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { ExamsTabs } from '../exams-tabs'
import { createClient } from '@/lib/supabase/server'
import { AddGradingSchemeForm, GradingSchemeCard, type GradingSchemeRow, type GradeBandRow } from './grading-scheme-controls'

export default async function GradingSchemesPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: schemes } = await supabase
    .from('grading_schemes')
    .select('id, name, scheme_type, pass_mark_percent, pass_rule_strategy, combine_subject_groups')
    .order('created_at', { ascending: false })

  const schemeIds = (schemes ?? []).map((s) => s.id)
  const { data: bands } = schemeIds.length
    ? await supabase
        .from('grade_bands')
        .select('id, grading_scheme_id, label, min_percent, max_percent, grade_point, sort_order')
        .in('grading_scheme_id', schemeIds)
        .order('sort_order', { ascending: true })
    : { data: [] as GradeBandRow[] }

  const bandsByScheme = new Map<string, GradeBandRow[]>()
  for (const band of bands ?? []) {
    const list = bandsByScheme.get(band.grading_scheme_id) ?? []
    list.push(band)
    bandsByScheme.set(band.grading_scheme_id, list)
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('grading.title', lang)}</h1>
        <Link href="/school/exams" aria-label={t('exams.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <ExamsTabs active="/school/exams/grading-schemes" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('grading.addScheme', lang)}</h2>
        <AddGradingSchemeForm lang={lang} />
      </section>

      <section className="space-y-4">
        {!schemes?.length && <p className="text-sm text-muted">{t('grading.none', lang)}</p>}
        {schemes?.map((scheme) => (
          <GradingSchemeCard
            key={scheme.id}
            scheme={scheme as GradingSchemeRow}
            bands={bandsByScheme.get(scheme.id) ?? []}
            lang={lang}
          />
        ))}
      </section>
    </main>
  )
}
