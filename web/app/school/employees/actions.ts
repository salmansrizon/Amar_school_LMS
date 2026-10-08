'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateOptionalLogin, validateEmployeeCategory } from '@/lib/employees'
import { isKnownAcademicShift } from '@/lib/institute'
import { checkMobile } from '@/lib/bd-mobile'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { pgConstraintMessage } from '@/lib/crud/pg-error'
import { changeStaffLogin, disabledStaffLogins, staffLoginState } from '@/lib/staff-login'

// RLS scopes all writes to the caller's School.

const PAGE = '/school/employees'

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
  const lang = await currentLang()
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: t('employees.errNameRequired', lang) }

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const loginCheck = validateOptionalLogin(email, password, lang)
  if (loginCheck.error) return { error: loginCheck.error }

  const fields = profileFields(formData)
  const mobile = checkMobile(fields.mobile)
  if (mobile.invalid) return { error: t('people.errMobileInvalid', lang) }
  fields.mobile = mobile.value
  // No `existing` value on create — there's no prior row to grandfather in,
  // so a category has to be one of the fixed four or blank (issue #567).
  const categoryCheck = validateEmployeeCategory(fields.category)
  if (categoryCheck.error) return { error: categoryCheck.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .insert({ full_name: name, ...fields })
    .select('id')
    .single()
  if (error) return { error: t('employees.errSaveFailed', lang) }
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
      .from('class_offerings')
      .update({ class_teacher_id: employeeId })
      .eq('id', classId)
    if (classError) {
      return { id: employeeId, error: `Employee created, but the class assignment failed: ${classError.message}` }
    }
    revalidatePath('/school/classes')
  }

  // Shifts this Employee works (issue #580, Wave 5/#590) — deferred until
  // now, the same "employee_id has to exist first" reason class_id's
  // assignment is deferred above. Re-validated server-side even though the
  // checkbox list already only offers configured_shifts values.
  const shifts = formData.getAll('shifts').map(String).filter(isKnownAcademicShift)
  if (shifts.length > 0) {
    const { error: shiftError } = await supabase
      .from('employee_academic_shifts')
      .insert(shifts.map((shift) => ({ employee_id: employeeId, shift })))
    if (shiftError) {
      return { id: employeeId, error: `Employee created, but the Shift assignment failed: ${shiftError.message}` }
    }
  }

  revalidatePath(PAGE)
  return { id: employeeId }
}

export async function updateEmployee(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Employee is required' }
  const lang = await currentLang()
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: t('employees.errNameRequired', lang) }
  const supabase = await createClient()

  const fields = profileFields(formData)
  // A legacy category (predates issue #567's fixed list, or was typed in
  // before the field was locked down — the seed data itself has "Head
  // Teacher") stays valid as long as the submission didn't change it: fetched
  // here so re-saving an edit without touching Category never fails.
  const { data: current } = await supabase.from('employees').select('category, mobile').eq('id', id).single()
  const categoryCheck = validateEmployeeCategory(fields.category, current?.category ?? null)
  if (categoryCheck.error) return { error: categoryCheck.error }
  // Same grandfathering as the category: only a changed mobile must be valid.
  const mobile = checkMobile(fields.mobile, current?.mobile)
  if (mobile.invalid) return { error: t('people.errMobileInvalid', lang) }
  fields.mobile = mobile.value

  const { data, error } = await supabase
    .from('employees')
    .update({ full_name: name, ...fields })
    .eq('id', id)
    .select('id')
  if (error) return { error: t('employees.errSaveFailed', lang) }
  if (!data?.length) return { error: t('employees.errNotFound', lang) }
  revalidatePath(PAGE)
  revalidatePath(`${PAGE}/${id}`)
  return {}
}

/** Old Employees soft-archive (§5.2) — the row stays for history/reports.
 *
 *  `disableLogin` (#688): also turn the linked Staff login off. Archive first —
 *  it is the action asked for — then the login; if the login step fails the
 *  archive stands and `warning` says the login is still on. Only the School
 *  Owner can disable a login (the database function refuses others), and until
 *  migration 0241 is applied the step reports the same warning. */
export async function archiveEmployee(
  id: string,
  disableLogin = false,
): Promise<{ error?: string; warning?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, profile_id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Employee not found' }
  revalidatePath(PAGE)
  revalidatePath(`${PAGE}/${id}`)
  revalidatePath(`${PAGE}/archive`)

  const profileId = data[0].profile_id as string | null
  if (disableLogin && profileId) {
    if ((await changeStaffLogin(supabase, profileId, true)) !== 'ok') {
      return { warning: t('employees.archiveLoginNotDisabled', await currentLang()) }
    }
    revalidatePath('/school/staff')
  }
  return {}
}

/** Un-archive. Does NOT turn a disabled Staff login back on (#688): giving
 *  access back is the Owner's separate decision on the Staff page. `notice`
 *  says so when the linked login is off (the Owner is the only one who can
 *  read that, so nobody else gets the notice). */
export async function restoreEmployee(id: string): Promise<{ error?: string; notice?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .update({ archived_at: null })
    .eq('id', id)
    .select('id, profile_id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Employee not found' }
  revalidatePath(PAGE)
  revalidatePath(`${PAGE}/${id}`)
  revalidatePath(`${PAGE}/archive`)

  const profileId = data[0].profile_id as string | null
  if (profileId && staffLoginState(await disabledStaffLogins(supabase), profileId) === 'disabled') {
    return { notice: t('employees.restoreLoginStillDisabled', await currentLang()) }
  }
  return {}
}

/** An Employee's permanent academic Shift assignment (issue #580, Wave
 *  5/#590) — an insert/delete toggle against employee_academic_shifts.
 *  Re-validates the fixed vocabulary server-side (choices at the UI layer are
 *  narrowed to configured_shifts, #580's Q2, but that narrowing is a picker
 *  restriction, not a security boundary — same reasoning as addClass's shift
 *  field). */
export async function setShiftAssignment(
  employeeId: string,
  shift: string,
  assigned: boolean,
): Promise<{ error?: string }> {
  if (!isKnownAcademicShift(shift)) return { error: 'Invalid Shift' }
  const supabase = await createClient()
  const { error } = assigned
    ? await supabase.from('employee_academic_shifts').insert({ employee_id: employeeId, shift })
    : await supabase.from('employee_academic_shifts').delete().eq('employee_id', employeeId).eq('shift', shift)
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
    const lang = await currentLang()
    const linked = pgConstraintMessage(error, 'employees_profile_unique', t('employees.errLoginLinked', lang))
    return { error: linked === error.message ? t('employees.errSaveFailed', lang) : linked }
  }
  if (!data?.length) return { error: 'Employee not found' }
  revalidatePath(`${PAGE}/${employeeId}`)
  return {}
}
