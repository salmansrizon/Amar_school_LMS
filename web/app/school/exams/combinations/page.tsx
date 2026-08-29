import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { ExamsTabs } from '../exams-tabs'
import { getSchoolContext } from '@/lib/school/context'
import {
  AddCombinationForm,
  CombinationCard,
  type CombinationRow,
  type ExamOption,
  type MemberRow,
  type SchemeOption,
} from './combination-controls'
import { BackLink } from '@/components/back-link'
import { classCatalogueLabel, type ClassCatalogueRow } from '@/lib/class-catalogue'

// Multi-exam combination (issue #32, PRD §5.5): a named recipe for combining
// several exams — 'sum' (raw marks add together) or 'weighted_percentage'
// (each member's overall percent scaled by its weight, remainder
// auto-assigned to at most one unweighted member) — that the Promotion page
// can pick as its result source instead of a single exam. No dedicated
// mockup ships this screen (only marks-entry.html/promotion-transfer.html
// are this ticket's strict references); it follows the same list+inline-form
// pattern as grading-schemes (issue #31).

export default async function ExamCombinationsPage() {
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ data: combinations }, { data: classes }, { data: schemes }, { data: exams }] = await Promise.all([
    supabase
      .from('exam_combinations')
      .select('id, name, class_id, strategy, grading_scheme_id')
      .order('created_at', { ascending: false }),
    supabase.from('classes').select('id, name, section, group_department').order('created_at'),
    supabase.from('grading_schemes').select('id, name').order('name'),
    supabase.from('exams').select('id, name, exam_year').order('created_at', { ascending: false }),
  ])

  const combinationIds = (combinations ?? []).map((c) => c.id)
  const { data: members } = combinationIds.length
    ? await supabase
        .from('exam_combination_members')
        .select('id, combination_id, exam_id, weight_percent')
        .in('combination_id', combinationIds)
    : { data: [] as MemberRow[] }

  const membersByCombination = new Map<string, MemberRow[]>()
  for (const m of members ?? []) {
    const list = membersByCombination.get(m.combination_id) ?? []
    list.push(m)
    membersByCombination.set(m.combination_id, list)
  }
  const classById = new Map((classes ?? []).map((c) => [c.id, c]))
  const schemeById = new Map((schemes ?? []).map((s) => [s.id, s]))

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('combinations.title', lang)}</h1>
        <BackLink href="/school/exams" label={t('exams.title', lang)} />
      </div>

      <ExamsTabs active="/school/exams/combinations" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">{t('combinations.add', lang)}</h2>
        <AddCombinationForm classes={(classes ?? []) as ClassCatalogueRow[]} schemes={(schemes ?? []) as SchemeOption[]} lang={lang} />
      </section>

      <section className="space-y-4">
        {!combinations?.length && <p className="text-sm text-muted">{t('combinations.none', lang)}</p>}
        {combinations?.map((c) => {
          const cls = classById.get(c.class_id ?? '')
          const classLabel = cls ? classCatalogueLabel(cls) : null
          return (
            <CombinationCard
              key={c.id}
              combination={c as CombinationRow}
              classLabel={classLabel}
              schemeName={schemeById.get(c.grading_scheme_id ?? '')?.name ?? null}
              members={membersByCombination.get(c.id) ?? []}
              exams={(exams ?? []) as ExamOption[]}
              lang={lang}
            />
          )
        })}
      </section>
    </div>
  )
}
