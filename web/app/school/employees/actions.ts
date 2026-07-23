'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS scopes all writes to the caller's School.

const PAGE = '/school/employees'

/** Empty → null; invalid → NaN (callers reject); otherwise the integer. */
function optionalMinutes(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const minutes = Number(raw)
  return Number.isInteger(minutes) && minutes >= 0 ? minutes : Number.NaN
}

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? '').trim() || null
}

/** The full profile columns (issue #28) shared by create and edit. */
function profileFields(formData: FormData) {
  return {
    mobile: text(formData, 'mobile'),
    date_of_birth: text(formData, 'date_of_birth'),
    joining_date: text(formData, 'joining_date'),
    bank_name: text(formData, 'bank_name'),
    bank_branch: text(formData, 'bank_branch'),
    bank_account: text(formData, 'bank_account'),
    category: text(formData, 'category'),
    qualification: text(formData, 'qualification'),
    department: text(formData, 'department'),
    subject_taught: text(formData, 'subject_taught'),
  }
}

export async function createEmployee(
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const override = optionalMinutes(formData.get('grace_override'))
  if (Number.isNaN(override)) return { error: 'Grace must be a non-negative integer' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .insert({ full_name: name, grace_override_minutes: override, ...profileFields(formData) })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { id: data.id }
}

export async function updateEmployee(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Employee is required' }
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const override = optionalMinutes(formData.get('grace_override'))
  if (Number.isNaN(override)) return { error: 'Grace must be a non-negative integer' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .update({ full_name: name, grace_override_minutes: override, ...profileFields(formData) })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Employee not found' }
  revalidatePath(PAGE)
  revalidatePath(`${PAGE}/${id}`)
  return {}
}

/** Old Employees soft-archive (§5.2) — the row stays for history/reports. */
export async function archiveEmployee(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Employee not found' }
  revalidatePath(PAGE)
  revalidatePath(`${PAGE}/${id}`)
  revalidatePath(`${PAGE}/archive`)
  return {}
}

export async function restoreEmployee(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .update({ archived_at: null })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Employee not found' }
  revalidatePath(PAGE)
  revalidatePath(`${PAGE}/${id}`)
  revalidatePath(`${PAGE}/archive`)
  return {}
}

export async function addOfficeTime(formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const grace = optionalMinutes(formData.get('grace_minutes'))
  if (Number.isNaN(grace)) return { error: 'Grace must be a non-negative integer' }
  const supabase = await createClient()
  const { error } = await supabase.from('office_times').insert({ name, grace_minutes: grace })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function setOfficeTimeAssignment(
  employeeId: string,
  officeTimeId: string,
  assigned: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = assigned
    ? await supabase.from('employee_office_times').insert({ employee_id: employeeId, office_time_id: officeTimeId })
    : await supabase
        .from('employee_office_times')
        .delete()
        .eq('employee_id', employeeId)
        .eq('office_time_id', officeTimeId)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function setCategoryGrace(formData: FormData): Promise<{ error?: string }> {
  const category = String(formData.get('category') ?? '').trim()
  if (!category) return { error: 'Category is required' }
  const grace = Number(formData.get('grace_minutes'))
  if (!Number.isInteger(grace) || grace < 0) return { error: 'Grace must be a non-negative integer' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('category_grace_minutes')
    .upsert({ category, grace_minutes: grace }, { onConflict: 'school_id,category' })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
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
