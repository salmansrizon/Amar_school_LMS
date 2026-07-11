// Exams III (issue #32): the one DB-touching companion to grading.ts's pure
// evaluation functions — shared by the Marks Entry and Promotion pages so the
// grading_schemes/grade_bands -> GradingScheme shaping isn't duplicated
// between them. Kept out of grading.ts itself so that file stays a trivially
// unit-testable, DB-free module (its own header comment's rule).
import type { createClient } from '@/lib/supabase/server'
import type { GradingScheme } from '@/lib/grading'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export async function loadGradingScheme(
  supabase: SupabaseServerClient,
  schemeId: string,
): Promise<GradingScheme | null> {
  const { data: scheme } = await supabase
    .from('grading_schemes')
    .select('scheme_type, pass_mark_percent, pass_rule_strategy, combine_subject_groups')
    .eq('id', schemeId)
    .maybeSingle()
  if (!scheme) return null

  const { data: bands } = await supabase
    .from('grade_bands')
    .select('label, min_percent, max_percent, grade_point')
    .eq('grading_scheme_id', schemeId)
    .order('sort_order', { ascending: true })

  return {
    schemeType: scheme.scheme_type as GradingScheme['schemeType'],
    passMarkPercent: Number(scheme.pass_mark_percent),
    passRuleStrategy: scheme.pass_rule_strategy as GradingScheme['passRuleStrategy'],
    combineSubjectGroups: scheme.combine_subject_groups,
    bands: (bands ?? []).map((b) => ({
      label: b.label,
      minPercent: Number(b.min_percent),
      maxPercent: Number(b.max_percent),
      gradePoint: b.grade_point === null ? null : Number(b.grade_point),
    })),
  }
}
