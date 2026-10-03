'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSchoolContext } from '@/lib/school/context'
import { isKnownEmployeeCategory, EMPLOYEE_CATEGORIES } from '@/lib/employees'
import { officeHourShiftOptions } from '@/lib/office-hours'
import { isGraceDetail, GRACE_DETAILS } from '@/lib/grace'

// Grace Time (issue #671, redesigned by #673 / ADR 0032): Standing Grace
// Rules (Grace Detail + Shift + Categories + minutes, unique per Shift +
// Grace Detail) and dated Ad-Hoc Grace Exemptions, both with a display-only
// Shift. RLS scopes every read/write to the caller's School.

const PAGE = '/school/attendance/employee/grace-time'

/** Same rule as Office Hour's parseSelections: a Shift must be one the
 *  caller's School currently offers, so a hand-built request can't plant a
 *  row under a Shift the page would never show. Empty means No-Shift. */
async function parseShift(formData: FormData): Promise<{ shift: string | null } | { error: string }> {
  const shift = String(formData.get('shift') ?? '').trim() || null
  if (!shift) return { shift: null }
  const { configuredShifts } = await getSchoolContext()
  if (!(officeHourShiftOptions(configuredShifts) as readonly string[]).includes(shift)) {
    return { error: 'Shift is not configured for this School' }
  }
  return { shift }
}

function parseCategories(formData: FormData): { categories: string[] } | { error: string } {
  const categories = [...new Set(formData.getAll('category').map(String))]
  if (!categories.length) return { error: 'Select at least one category' }
  if (categories.some((c) => !isKnownEmployeeCategory(c))) {
    return { error: `Category must be one of: ${EMPLOYEE_CATEGORIES.join(', ')}` }
  }
  return { categories }
}

function parseMinutes(value: FormDataEntryValue | null, label: string): { minutes: number } | { error: string } {
  const raw = String(value ?? '').trim()
  const minutes = Number(raw)
  if (!raw || !Number.isInteger(minutes) || minutes < 0) return { error: `${label} must be a non-negative integer` }
  return { minutes }
}

interface ParsedRule {
  shift: string | null
  detail: string
  minutes: number
  categories: string[]
}

async function parseRule(formData: FormData): Promise<ParsedRule | { error: string }> {
  const detail = String(formData.get('grace_detail') ?? '').trim()
  if (!isGraceDetail(detail)) return { error: `Grace Details must be one of: ${GRACE_DETAILS.join(', ')}` }
  const shift = await parseShift(formData)
  if ('error' in shift) return shift
  const categories = parseCategories(formData)
  if ('error' in categories) return categories
  const minutes = parseMinutes(formData.get('grace_minutes'), 'Grace')
  if ('error' in minutes) return minutes
  return { shift: shift.shift, detail, minutes: minutes.minutes, categories: categories.categories }
}

export interface StandingRuleConflict {
  grace_minutes: number
  categories: string[]
}

/** Read-only preflight (Office Hour's pattern, issue #643): the existing rule
 *  for this Shift + Grace Detail, if any, so the form can confirm before
 *  replacing it — never a silent overwrite. */
export async function previewStandingGraceRule(
  formData: FormData,
): Promise<{ conflict: StandingRuleConflict | null } | { error: string }> {
  const parsed = await parseRule(formData)
  if ('error' in parsed) return parsed

  const supabase = await createClient()
  const base = supabase
    .from('standing_grace_rules')
    .select('grace_minutes, standing_grace_rule_categories(category)')
    .eq('grace_detail', parsed.detail)
  const { data, error } = await (parsed.shift ? base.eq('shift', parsed.shift) : base.is('shift', null)).maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { conflict: null }
  return {
    conflict: {
      grace_minutes: data.grace_minutes,
      categories: (data.standing_grace_rule_categories ?? []).map((c: { category: string }) => c.category),
    },
  }
}

/** Create or replace (Categories and minutes) the rule for this Shift +
 *  Grace Detail, atomically via save_standing_grace_rule (migration 0210). */
export async function saveStandingGraceRule(formData: FormData): Promise<{ error?: string }> {
  const parsed = await parseRule(formData)
  if ('error' in parsed) return parsed

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_standing_grace_rule', {
    p_shift: parsed.shift,
    p_grace_detail: parsed.detail,
    p_grace_minutes: parsed.minutes,
    p_categories: parsed.categories,
  })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function deleteStandingGraceRule(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('standing_grace_rules').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

/** A dated, one-off addition to the Considerable Grace Window's MAX rule
 *  (issue #671) — a duration and reason for one specific date, applying to
 *  every Employee in one or more selected Categories; its Shift is
 *  display-only (#673). Two inserts (the exemption row, then its category
 *  rows) rather than one call, since Postgres has no single-statement
 *  "insert with a to-many array" shape for this join-table pattern. Not
 *  transactional across the two — a failure after the first insert leaves an
 *  exemption with no categories, which applies to nobody (harmless). */
export async function addAdHocGraceExemption(formData: FormData): Promise<{ error?: string }> {
  const exemptionDate = String(formData.get('exemption_date') ?? '').trim()
  if (!exemptionDate) return { error: 'Date is required' }
  const details = String(formData.get('details') ?? '').trim() || null
  const duration = parseMinutes(formData.get('duration_minutes'), 'Duration')
  if ('error' in duration) return duration
  const shift = await parseShift(formData)
  if ('error' in shift) return shift
  const categories = parseCategories(formData)
  if ('error' in categories) return categories

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ad_hoc_grace_exemptions')
    .insert({ exemption_date: exemptionDate, details, duration_minutes: duration.minutes, shift: shift.shift })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const { error: categoryError } = await supabase
    .from('ad_hoc_grace_exemption_categories')
    .insert(categories.categories.map((category) => ({ exemption_id: data.id, category })))
  if (categoryError) return { error: categoryError.message }

  revalidatePath(PAGE)
  return {}
}

export async function deleteAdHocGraceExemption(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('ad_hoc_grace_exemptions').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
