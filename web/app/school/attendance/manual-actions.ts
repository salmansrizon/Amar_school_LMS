'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

const MARK_PAGE = '/school/attendance/mark'
const LEAVE_PAGE = '/school/attendance/leave'
const OFFDAY_PAGE = '/school/attendance/off-days'

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
  revalidatePath(LEAVE_PAGE)
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
  revalidatePath(LEAVE_PAGE)
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
