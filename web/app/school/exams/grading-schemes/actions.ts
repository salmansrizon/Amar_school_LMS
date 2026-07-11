'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { bandOverlaps, type SchemeType, type PassRuleStrategy } from '@/lib/grading'

// RLS ("school members manage …" scoped to app_current_school_id()) plus the
// grade_band_same_school trigger are the authority on tenancy here — these
// actions only validate + shape input and enforce the non-overlap rule that
// resolveGradeBand() (web/lib/grading.ts) depends on.

const PAGE = '/school/exams/grading-schemes'

const SCHEME_TYPES: ReadonlySet<string> = new Set(['grade_point', 'letter', 'numeric'])
const PASS_RULE_STRATEGIES: ReadonlySet<string> = new Set([
  'individual',
  'combined_average',
  'optional_conditional',
])

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

export async function addGradingScheme(formData: FormData): Promise<{ error?: string }> {
  const name = str(formData, 'name')
  if (!name) return { error: 'Name is required' }
  const schemeType = str(formData, 'scheme_type') as SchemeType
  if (!SCHEME_TYPES.has(schemeType)) return { error: 'Invalid scheme type' }
  const passMark = Number(formData.get('pass_mark_percent'))
  if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100)
    return { error: 'Pass mark must be between 0 and 100' }
  const passRuleStrategy = str(formData, 'pass_rule_strategy') as PassRuleStrategy
  if (!PASS_RULE_STRATEGIES.has(passRuleStrategy)) return { error: 'Invalid pass-rule strategy' }
  const combineSubjectGroups = formData.get('combine_subject_groups') === 'on'

  const supabase = await createClient()
  const { error } = await supabase.from('grading_schemes').insert({
    name,
    scheme_type: schemeType,
    pass_mark_percent: passMark,
    pass_rule_strategy: passRuleStrategy,
    combine_subject_groups: combineSubjectGroups,
  })
  if (error) {
    if (error.code === '23505') return { error: 'A grading scheme with this name already exists' }
    return { error: error.message }
  }
  revalidatePath(PAGE)
  return {}
}

export async function removeGradingScheme(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('grading_schemes').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Grading scheme not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}

export async function addGradeBand(formData: FormData): Promise<{ error?: string }> {
  const gradingSchemeId = str(formData, 'grading_scheme_id')
  if (!gradingSchemeId) return { error: 'Grading scheme is required' }
  const label = str(formData, 'label')
  if (!label) return { error: 'Label is required' }
  const minPercent = Number(formData.get('min_percent'))
  const maxPercent = Number(formData.get('max_percent'))
  if (!Number.isFinite(minPercent) || minPercent < 0 || minPercent > 100)
    return { error: 'Min % must be between 0 and 100' }
  if (!Number.isFinite(maxPercent) || maxPercent < minPercent || maxPercent > 100)
    return { error: 'Max % must be between Min % and 100' }
  const gradePointRaw = str(formData, 'grade_point')
  const gradePoint = gradePointRaw ? Number(gradePointRaw) : null
  if (gradePoint !== null && (!Number.isFinite(gradePoint) || gradePoint < 0))
    return { error: 'Grade point must be zero or a positive number' }

  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase
    .from('grade_bands')
    .select('min_percent, max_percent')
    .eq('grading_scheme_id', gradingSchemeId)
  if (fetchError) return { error: fetchError.message }
  const overlaps = bandOverlaps(
    (existing ?? []).map((b) => ({ minPercent: b.min_percent, maxPercent: b.max_percent })),
    { minPercent, maxPercent },
  )
  if (overlaps) return { error: 'This range overlaps an existing band for this scheme' }

  const { error } = await supabase.from('grade_bands').insert({
    grading_scheme_id: gradingSchemeId,
    label,
    min_percent: minPercent,
    max_percent: maxPercent,
    grade_point: gradePoint,
    sort_order: Math.round(100 - maxPercent),
  })
  if (error) {
    if (error.code === '23505') return { error: 'This label already exists for this scheme' }
    return { error: error.message }
  }
  revalidatePath(PAGE)
  return {}
}

export async function removeGradeBand(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('grade_bands').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Grade band not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}
