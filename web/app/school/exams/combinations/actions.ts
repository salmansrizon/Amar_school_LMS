'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS ("school members manage …") plus enforce_exam_combination_school /
// enforce_exam_combination_member_school (tenancy + the "at most one blank
// weight" / "weights <= 100%" invariants, migration 0049) are the authority
// on tenancy and on the hard cases that are always wrong regardless of which
// member ends up unweighted. resolveMemberWeights (web/lib/exam-results.ts)
// does the fuller validation (weights must total exactly 100% once every
// member is explicit) at combine time.

const PAGE = '/school/exams/combinations'

const STRATEGIES: ReadonlySet<string> = new Set(['sum', 'weighted_percentage'])

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

export async function addCombination(formData: FormData): Promise<{ error?: string }> {
  const name = str(formData, 'name')
  if (!name) return { error: 'Name is required' }
  const strategy = str(formData, 'strategy')
  if (!STRATEGIES.has(strategy)) return { error: 'Invalid strategy' }
  const classId = str(formData, 'class_id') || null
  const gradingSchemeId = str(formData, 'grading_scheme_id') || null

  const supabase = await createClient()
  const { error } = await supabase.from('exam_combinations').insert({
    name,
    strategy,
    class_id: classId,
    grading_scheme_id: gradingSchemeId,
  })
  if (error) {
    if (error.code === '23505') return { error: 'A combination with this name already exists' }
    return { error: error.message }
  }
  revalidatePath(PAGE)
  return {}
}

export async function removeCombination(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('exam_combinations').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Combination not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}

export async function addCombinationMember(formData: FormData): Promise<{ error?: string }> {
  const combinationId = str(formData, 'combination_id')
  if (!combinationId) return { error: 'Combination is required' }
  const examId = str(formData, 'exam_id')
  if (!examId) return { error: 'Exam is required' }
  const weightRaw = str(formData, 'weight_percent')
  const weightPercent = weightRaw ? Number(weightRaw) : null
  if (weightPercent !== null && (!Number.isFinite(weightPercent) || weightPercent < 0 || weightPercent > 100)) {
    return { error: 'Weight must be between 0 and 100' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('exam_combination_members').insert({
    combination_id: combinationId,
    exam_id: examId,
    weight_percent: weightPercent,
  })
  if (error) {
    if (error.code === '23505') return { error: 'This exam is already a member of this combination' }
    return { error: error.message }
  }
  revalidatePath(PAGE)
  return {}
}

export async function removeCombinationMember(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('exam_combination_members').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Member not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}
