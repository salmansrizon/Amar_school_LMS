'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isKnownEmployeeCategory, EMPLOYEE_CATEGORIES } from '@/lib/employees'

// Grace Time (issue #671, ADR 0030): relocated from
// app/school/employees/actions.ts (setDefaultGrace, setCategoryGrace — now
// also carrying Prayer & Tiffin Window) plus the new Ad-Hoc Grace Exemption
// action. RLS scopes every write to the caller's School.

const PAGE = '/school/attendance/employee/grace-time'

/** Empty → null; invalid → NaN (callers reject); otherwise the integer. */
function optionalMinutes(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const minutes = Number(raw)
  return Number.isInteger(minutes) && minutes >= 0 ? minutes : Number.NaN
}

export async function setDefaultGrace(formData: FormData): Promise<{ error?: string }> {
  const raw = String(formData.get('minutes') ?? '').trim()
  const minutes = raw === '' ? null : Number(raw)
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0)) {
    return { error: 'Grace must be a non-negative integer' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_school_default_grace', { minutes })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

/** Category is a `<select>` over the fixed EMPLOYEE_CATEGORIES list (issue
 *  #666), not free text — same isKnownEmployeeCategory check Office Hour and
 *  the Employee form already use. Grace and Prayer & Tiffin Window are
 *  separate, independently-optional columns on the same
 *  (school_id, category) row (issue #671) — grace stays required, matching
 *  its pre-existing behavior; Prayer & Tiffin is optional, since most
 *  Categories won't need it. */
export async function setCategoryGrace(formData: FormData): Promise<{ error?: string }> {
  const category = String(formData.get('category') ?? '').trim()
  if (!category) return { error: 'Category is required' }
  if (!isKnownEmployeeCategory(category)) {
    return { error: `Category must be one of: ${EMPLOYEE_CATEGORIES.join(', ')}` }
  }
  const grace = Number(formData.get('grace_minutes'))
  if (!Number.isInteger(grace) || grace < 0) return { error: 'Grace must be a non-negative integer' }
  const prayerTiffin = optionalMinutes(formData.get('prayer_tiffin_minutes'))
  if (Number.isNaN(prayerTiffin)) return { error: 'Prayer & Tiffin Window must be a non-negative integer' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('category_grace_minutes')
    .upsert(
      { category, grace_minutes: grace, prayer_tiffin_minutes: prayerTiffin },
      { onConflict: 'school_id,category' },
    )
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

/** A dated, one-off addition to the Considerable Grace Window's MAX rule
 *  (issue #671) — a duration and reason for one specific date, applying to
 *  every Employee in one or more selected Categories. Two inserts (the
 *  exemption row, then its category rows) rather than one call, since
 *  Postgres has no single-statement "insert with a to-many array" shape for
 *  this join-table pattern. Not transactional across the two — a failure
 *  after the first insert leaves an exemption with no categories, which
 *  applies to nobody (harmless, not a security or data-integrity concern),
 *  rather than the more confusing alternative of guessing which half to roll
 *  back through two separate RLS-scoped client calls. */
export async function addAdHocGraceExemption(formData: FormData): Promise<{ error?: string }> {
  const exemptionDate = String(formData.get('exemption_date') ?? '').trim()
  if (!exemptionDate) return { error: 'Date is required' }
  const details = String(formData.get('details') ?? '').trim() || null
  const duration = Number(formData.get('duration_minutes'))
  if (!Number.isInteger(duration) || duration < 0) return { error: 'Duration must be a non-negative integer' }
  const categories = [...new Set(formData.getAll('category').map(String))]
  if (!categories.length) return { error: 'Select at least one category' }
  if (categories.some((c) => !isKnownEmployeeCategory(c))) {
    return { error: `Category must be one of: ${EMPLOYEE_CATEGORIES.join(', ')}` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ad_hoc_grace_exemptions')
    .insert({ exemption_date: exemptionDate, details, duration_minutes: duration })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const { error: categoryError } = await supabase
    .from('ad_hoc_grace_exemption_categories')
    .insert(categories.map((category) => ({ exemption_id: data.id, category })))
  if (categoryError) return { error: categoryError.message }

  revalidatePath(PAGE)
  return {}
}
