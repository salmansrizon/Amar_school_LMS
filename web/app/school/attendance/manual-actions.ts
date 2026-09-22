'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember, requireSchoolOwnerProfile } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

const MARK_PAGE = '/school/attendance/mark'
const STUDENT_LEAVE_PAGE = '/school/attendance/leave/student'
const EMPLOYEE_LEAVE_PAGE = '/school/attendance/leave/employee'
const OFFDAY_PAGE = '/school/attendance/off-days'
const leavePageFor = (kind: string) => (kind === 'student' ? STUDENT_LEAVE_PAGE : EMPLOYEE_LEAVE_PAGE)

export interface AttendanceRecordInput {
  student_id: string
  present: boolean
  cause: string
}

export async function saveStudentAttendance(
  attDate: string,
  records: AttendanceRecordInput[],
): Promise<{ error?: string; saved?: number }> {
  if (!attDate) return { error: 'Date is required' }
  if (!records.length) return { error: 'No students to save' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase.rpc('save_student_attendance', {
    p_att_date: attDate,
    p_records: records,
  })
  if (error) return { error: error.message }
  revalidatePath(MARK_PAGE)
  return { saved: data as number }
}

export async function requestLeave(formData: FormData): Promise<{ error?: string }> {
  const holder = String(formData.get('holder') ?? '') // "student:<id>" | "employee:<id>"
  const [kind, personId] = holder.split(':')
  const fromDay = String(formData.get('from_day') ?? '')
  const toDay = String(formData.get('to_day') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || null
  if (!personId || (kind !== 'student' && kind !== 'employee')) return { error: 'Person is required' }
  if (!fromDay || !toDay) return { error: 'From and to dates are required' }
  if (toDay < fromDay) return { error: 'To date must be on or after the from date' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const table = kind === 'student' ? 'student_leaves' : 'employee_leaves'
  const idField = kind === 'student' ? 'student_id' : 'employee_id'
  const { error } = await supabase.from(table).insert({ [idField]: personId, from_day: fromDay, to_day: toDay, reason })
  if (error) return { error: error.message }
  revalidatePath(leavePageFor(kind))
  return {}
}

async function setLeaveStatus(
  kind: string,
  id: string,
  status: 'approved' | 'rejected',
): Promise<{ error?: string }> {
  if ((kind !== 'student' && kind !== 'employee') || !id) return { error: 'Invalid leave' }
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const table = kind === 'student' ? 'student_leaves' : 'employee_leaves'
  const { data, error } = await supabase.from(table).update({ status }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Leave request not found or not accessible' }
  revalidatePath(leavePageFor(kind))
  return {}
}

export async function approveLeave(kind: string, id: string): Promise<{ error?: string }> {
  return setLeaveStatus(kind, id, 'approved')
}

export async function rejectLeave(kind: string, id: string): Promise<{ error?: string }> {
  return setLeaveStatus(kind, id, 'rejected')
}

export async function addOffDay(formData: FormData): Promise<{ error?: string }> {
  const day = String(formData.get('day') ?? '')
  const label = String(formData.get('label') ?? '').trim() || null
  const isSignificant = formData.get('is_significant') === 'on'
  if (!day) return { error: 'Date is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('off_days')
    .upsert({ day, label, is_significant: isSignificant }, { onConflict: 'school_id,day' })
  if (error) return { error: error.message }
  revalidatePath(OFFDAY_PAGE)
  return {}
}

export async function deleteOffDay(day: string): Promise<{ error?: string }> {
  if (!day) return { error: 'Date is required' }
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('off_days').delete().eq('day', day)
  if (error) return { error: error.message }
  revalidatePath(OFFDAY_PAGE)
  return {}
}

/** Import the super-admin's central off-day template (issue #166) into this
 *  school's off_days. Existing days are left untouched (ignoreDuplicates); the
 *  central label falls back Bangla → English. Returns how many were newly added. */
export async function importCentralOffDays(): Promise<{ error?: string; imported?: number }> {
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data: central, error: readError } = await supabase
    .from('central_off_days')
    .select('day, label_bn, label_en')
  if (readError) return { error: readError.message }
  if (!central?.length) return { imported: 0 }

  // school_id defaults to app_current_school_id(); central days import as
  // regular (non-significant) off-days.
  const rows = central.map((c) => ({ day: c.day, label: c.label_bn ?? c.label_en ?? null }))
  const { data, error } = await supabase
    .from('off_days')
    .upsert(rows, { onConflict: 'school_id,day', ignoreDuplicates: true })
    .select('day')
  if (error) return { error: error.message }
  revalidatePath(OFFDAY_PAGE)
  return { imported: data?.length ?? 0 }
}

/** Replace this School's Weekly Off-Day weekdays (issue #665, ADR 0027) —
 *  wholesale, never merged: whatever weekdays were selected before are gone
 *  once this saves, matching the DB column's own "replaced, not appended"
 *  contract. An empty selection is valid (no regular weekly off-day at all).
 *
 *  Owner-only, like every other edit to the schools row itself (migration
 *  0043's "owner updates own school" policy — Staff Users may hold the
 *  attendance/institute Screen grants but never write this table directly).
 *  The `.select('id')` + length check mirrors setLeaveStatus's own handling
 *  of an RLS-filtered write: without it, a non-owner's update matches zero
 *  rows and returns no error, so the UI would report "Saved" while the
 *  School's setting silently stayed unchanged. */
export async function updateWeeklyOffDays(formData: FormData): Promise<{ error?: string }> {
  const weekdays = [...new Set(formData.getAll('weekday').map(Number))]
  if (weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { error: 'Invalid weekday' }

  const supabase = await createClient()
  const { ok, schoolId } = await requireSchoolOwnerProfile(supabase)
  if (!ok || !schoolId) return { error: 'Only the School Owner can change this setting' }

  const { data, error } = await supabase
    .from('schools')
    .update({ weekly_off_days: weekdays })
    .eq('id', schoolId)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Not authorized to update this setting' }
  revalidatePath(OFFDAY_PAGE)
  return {}
}
