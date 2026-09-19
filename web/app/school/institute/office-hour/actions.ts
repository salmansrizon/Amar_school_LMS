'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSchoolContext } from '@/lib/school/context'
import { isKnownEmployeeCategory } from '@/lib/employees'
import { expandOfficeHourSelections, officeHourShiftOptions, validateOfficeHourTimeRange } from '@/lib/office-hours'
import { pgConstraintMessage } from '@/lib/crud/pg-error'

// Office Hour (issue #643, ADR 0026): RLS scopes every read/write to the
// caller's School ("school members manage category_office_hours" — same
// grantable-screen convention as Venues' buildings/rooms, no owner gate).
// The DB's category_office_hours_identity_unique (nulls not distinct on
// school_id, shift, employee_category, day_of_week) is the real authority on
// conflicts; these actions validate shape and translate its errors.

const PAGE = '/school/institute/office-hour'

interface ParsedSelections {
  shift: string | null
  categories: string[]
  days: number[]
  start: string
  end: string
}

/** Re-validates Shift against the caller's own School's configured Shifts —
 *  not just the global 4-value vocabulary — since <OfficeHourForm>'s radio
 *  buttons only ever offer `officeHourShiftOptions(configuredShifts)`. A
 *  request that skipped that form (hand-built FormData, a stale client after
 *  Institute Setup narrowed configured_shifts) must not be able to plant a
 *  row under a Shift the School doesn't currently offer — such a row would
 *  be silently invisible in the matrix (the page only ever queries the
 *  resolved, configured activeShift) rather than rejected up front. */
async function parseSelections(formData: FormData): Promise<ParsedSelections | { error: string }> {
  const shift = String(formData.get('shift') ?? '').trim() || null
  if (shift) {
    const { configuredShifts } = await getSchoolContext()
    if (!(officeHourShiftOptions(configuredShifts) as readonly string[]).includes(shift))
      return { error: 'errInvalidShift' }
  }

  const categories = [...new Set(formData.getAll('employee_category').map(String))]
  const days = [...new Set(formData.getAll('day_of_week').map((v) => Number(v)))]
  const start = String(formData.get('start_time') ?? '')
  const end = String(formData.get('end_time') ?? '')

  if (!categories.length || !days.length) return { error: 'errNoSelection' }
  if (categories.some((c) => !isKnownEmployeeCategory(c))) return { error: 'errInvalidCategory' }
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { error: 'errNoSelection' }

  const timeErr = validateOfficeHourTimeRange(start, end)
  if (timeErr) return { error: timeErr }

  return { shift, categories, days, start, end }
}

export interface OfficeHourConflict {
  employee_category: string
  day_of_week: number
  start_time: string
  end_time: string
}

/** Read-only preflight (issue #643 §3/§4): which candidate combinations
 *  already have a saved Office Hour, so the form can show one confirmation
 *  summary before an overwrite — never a silent one. */
export async function previewOfficeHourSave(
  formData: FormData,
): Promise<{ conflicts: OfficeHourConflict[] } | { error: string }> {
  const parsed = await parseSelections(formData)
  if ('error' in parsed) return parsed
  const { shift, categories, days } = parsed

  const supabase = await createClient()
  const base = supabase
    .from('category_office_hours')
    .select('employee_category, day_of_week, start_time, end_time')
    .in('employee_category', categories)
    .in('day_of_week', days)
  const { data, error } = await (shift ? base.eq('shift', shift) : base.is('shift', null))
  if (error) return { error: error.message }
  return { conflicts: (data ?? []) as OfficeHourConflict[] }
}

/** Bulk create/update (issue #643 §3): N categories x M days for one Shift
 *  become N x M rows in a single atomic upsert, keyed by the exact columns
 *  category_office_hours_identity_unique covers — a combination that already
 *  exists is updated in place, never duplicated. */
export async function saveOfficeHours(formData: FormData): Promise<{ error?: string }> {
  const parsed = await parseSelections(formData)
  if ('error' in parsed) return parsed
  const { shift, categories, days, start, end } = parsed

  const now = new Date().toISOString()
  const rows = expandOfficeHourSelections(categories, days).map((sel) => ({
    shift,
    employee_category: sel.employee_category,
    day_of_week: sel.day_of_week,
    start_time: start,
    end_time: end,
    updated_at: now,
  }))

  const supabase = await createClient()
  const { error } = await supabase
    .from('category_office_hours')
    .upsert(rows, { onConflict: 'school_id,shift,employee_category,day_of_week' })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

/** Inline cell edit (issue #643 §5/§6): Start/End Time only — the cell's
 *  Shift, Category and Day are fixed by its position in the matrix, so this
 *  is a plain update by id, never an upsert. A conflict here isn't reachable
 *  through normal navigation (identity is pinned by cell position) but is
 *  guarded defensively rather than silently merged into another row — the
 *  deliberate asymmetry with saveOfficeHours' upsert. */
export async function updateOfficeHourCell(id: string, start: string, end: string): Promise<{ error?: string }> {
  const timeErr = validateOfficeHourTimeRange(start, end)
  if (timeErr) return { error: timeErr }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('category_office_hours')
    .update({ start_time: start, end_time: end, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) {
    return { error: pgConstraintMessage(error, 'category_office_hours_identity_unique', 'errDuplicate') }
  }
  // A row someone else already deleted (or RLS hid) matches zero rows rather
  // than erroring — without this check the caller would report success for
  // a save that changed nothing (same convention as venues/actions.ts's
  // deleteBuilding/deleteRoom).
  if (!data?.length) return { error: 'errNotFound' }
  revalidatePath(PAGE)
  return {}
}

export async function deleteOfficeHourCell(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('category_office_hours').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'errNotFound' }
  revalidatePath(PAGE)
  return {}
}
