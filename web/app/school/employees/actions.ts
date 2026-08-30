'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { friendlyEmployeeError, validateOptionalLogin } from '@/lib/employees'

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
    // Attendance-machine data-model prep (#564/#565) — plain text via the
    // same text() helper as every other optional field here, so a blank
    // submission is null, not '' (the partial unique index on
    // (school_id, rfid_card_number) is keyed off "is not null").
    rfid_card_number: text(formData, 'rfid_card_number'),
  }
}

/** Creates the HR record and, if the submitter filled them in, a login
 *  (linked to the record) and/or a class-teacher assignment — all optional,
 *  all in this one call (issue #566, folding in what used to be the
 *  separate "Add a teacher" flow, #533).
 *
 *  Email/password are both-or-neither: one without the other is a malformed
 *  submission (missing a password, or a typo'd email that got a password
 *  meant for it), not "no login wanted" — silently dropping just the one
 *  half would be a worse surprise than rejecting the submit outright.
 *
 *  Not transactional past the employee insert, because the remaining pieces
 *  span auth and public schemas. Ordered, and error-reported, so a failure
 *  leaves the least-bad state and names what to fix rather than making the
 *  Owner guess: the HR record goes first and is harmless alone; login before
 *  class, since a class assignment without a working login would be the
 *  more confusing half to debug; a later step's failure still returns the
 *  created id so the Owner is never told to start over on a record that
 *  already exists (#533's resilience property, preserved through the
 *  merge — this is the one behavior from the old two-form design worth
 *  keeping, not just an implementation detail dropped in the process). */
export async function createEmployee(
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const override = optionalMinutes(formData.get('grace_override'))
  if (Number.isNaN(override)) return { error: 'Grace must be a non-negative integer' }

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const loginCheck = validateOptionalLogin(email, password)
  if (loginCheck.error) return { error: loginCheck.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .insert({ full_name: name, grace_override_minutes: override, ...profileFields(formData) })
    .select('id')
    .single()
  if (error) return { error: friendlyEmployeeError(error) }
  const employeeId = data.id as string

  if (email && password) {
    const { data: profileId, error: loginError } = await supabase.rpc('create_staff_user', {
      staff_email: email,
      staff_password: password,
      staff_full_name: name,
    })
    if (loginError) {
      return { id: employeeId, error: `Employee created, but the login failed: ${loginError.message}` }
    }
    const linked = await setEmployeeLogin(employeeId, profileId as string)
    if (linked.error) {
      return { id: employeeId, error: `Login created, but linking it failed: ${linked.error}` }
    }
  }

  const classId = String(formData.get('class_id') ?? '').trim()
  if (classId) {
    const { error: classError } = await supabase
      .from('classes')
      .update({ class_teacher_id: employeeId })
      .eq('id', classId)
    if (classError) {
      return { id: employeeId, error: `Employee created, but the class assignment failed: ${classError.message}` }
    }
    revalidatePath('/school/classes')
  }

  revalidatePath(PAGE)
  return { id: employeeId }
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
  if (error) return { error: friendlyEmployeeError(error) }
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

/** Link (or unlink) an Employee to a Staff User login (#443). The bridge between
 *  the HR record every teacher reference already points at and an actual login,
 *  so a Class Teacher can sign in and see their classes. The same-school check
 *  is a DB trigger (employee_profile_same_school) — this is the app-layer half. */
export async function setEmployeeLogin(
  employeeId: string,
  profileId: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .update({ profile_id: profileId })
    .eq('id', employeeId)
    .select('id')
  if (error) {
    if (error.code === '23505') return { error: 'That login is already linked to another employee' }
    return { error: error.message }
  }
  if (!data?.length) return { error: 'Employee not found' }
  revalidatePath(`${PAGE}/${employeeId}`)
  return {}
}
