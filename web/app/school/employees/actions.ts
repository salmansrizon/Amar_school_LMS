'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { friendlyEmployeeError } from '@/lib/employees'

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
  if (error) return { error: friendlyEmployeeError(error) }
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

/** Create a teacher in one step: HR record, login, the link between them, and the
 *  class assignment (#533).
 *
 *  Every piece already existed — createEmployee, create_staff_user,
 *  setEmployeeLogin, and classes.class_teacher_id — across four separate screens.
 *  Nothing here is new capability; what was missing is that all four had to be
 *  remembered in order. A UAT pass created a teacher, stopped after the HR record,
 *  and could not test Class Teacher behaviour at all because the employee had no
 *  login. The failure is silent and student-facing: questions sit unanswered and
 *  the portal looks broken to a child.
 *
 *  No permission grant is set, and that is not an omission. ADR 0021 makes a Class
 *  Teacher's reach follow from the assignment itself — "the attachment alone is
 *  sufficient and no Grant is required" — so a grants step here would be a second
 *  chance to get it wrong.
 *
 *  Not transactional, because the pieces span auth and public schemas. Ordered so
 *  a failure leaves the least-bad state: the HR record is created first and is
 *  harmless alone, and the class assignment is last so a half-finished teacher is
 *  never attached to children. */
export async function createTeacher(
  formData: FormData,
): Promise<{ employeeId?: string; error?: string }> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const classId = String(formData.get('class_id') ?? '').trim()

  if (!email) return { error: 'Email is required' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters' }

  const created = await createEmployee(formData)
  if (created.error || !created.id) return { error: created.error ?? 'Could not create the employee record' }

  const supabase = await createClient()
  const { data: profileId, error: loginError } = await supabase.rpc('create_staff_user', {
    staff_email: email,
    staff_password: password,
    staff_full_name: String(formData.get('full_name') ?? '').trim(),
  })
  if (loginError) {
    // Name the half that succeeded. The employee exists and is reachable; telling
    // the Owner only "failed" would have them create a second one.
    return { employeeId: created.id, error: `Staff record created, but the login failed: ${loginError.message}` }
  }

  const linked = await setEmployeeLogin(created.id, profileId as string)
  if (linked.error) return { employeeId: created.id, error: `Login created, but linking it failed: ${linked.error}` }

  if (classId) {
    const { error: classError } = await supabase
      .from('classes')
      .update({ class_teacher_id: created.id })
      .eq('id', classId)
    if (classError) {
      return { employeeId: created.id, error: `Teacher created, but the class assignment failed: ${classError.message}` }
    }
  }

  revalidatePath(PAGE)
  revalidatePath('/school/classes')
  return { employeeId: created.id }
}
