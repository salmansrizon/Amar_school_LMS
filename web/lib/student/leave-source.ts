'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { schoolToday } from '@/lib/school-time'

/** A Student asking for leave (#452).
 *
 *  The row lands as 'pending' and joins the SAME queue at
 *  /school/attendance/leave that Attendance I already built — nothing new on
 *  the staff side, per the ticket. Once approved, the existing absent-fine and
 *  absence-SMS rules already excuse the days; none of that is rebuilt here.
 *
 *  Errors are returned as codes, not sentences: the raw English "To date must be
 *  on or after the from date" was being rendered straight into a Bangla screen.
 *  The caller maps a code to a message in the reader's language. */
export type LeaveError = 'readOnly' | 'required' | 'order' | 'past' | 'overlap' | 'notPending'

export async function requestLeave(formData: FormData): Promise<{ error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' satisfies LeaveError }

  const fromDay = String(formData.get('from_day') ?? '')
  const toDay = String(formData.get('to_day') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || null

  if (!fromDay || !toDay || !reason) return { error: 'required' satisfies LeaveError }
  if (toDay < fromDay) return { error: 'order' satisfies LeaveError }
  // Leave is permission to miss school, so it cannot be asked for backwards.
  // Same Asia/Dhaka "today" the rest of the portal uses.
  if (fromDay < schoolToday()) return { error: 'past' satisfies LeaveError }

  const supabase = await createClient()

  // One request per stretch of days. Without this the same range could be sent
  // twice with two taps, and the Owner's queue filled with duplicates nobody
  // could tell apart. Overlap, not equality: two requests covering the same
  // Tuesday are the same question asked twice.
  //
  // ponytail: check-then-insert, so two truly simultaneous submits can still
  // both land. Closing that needs an exclusion constraint on
  // (student_id, daterange(from_day, to_day)) with btree_gist, which cannot be
  // added to a shared database that already holds overlapping rows without
  // reconciling them first. Add it if duplicates show up in the Owner's queue.
  const { data: clashes } = await supabase
    .from('student_leaves')
    .select('id')
    .neq('status', 'rejected')
    .lte('from_day', toDay)
    .gte('to_day', fromDay)
    .limit(1)
  if (clashes?.length) return { error: 'overlap' satisfies LeaveError }

  // status is left to its 'pending' default and the 0146 trigger refuses
  // anything else from a student, so an approved row cannot be forged here.
  const { error } = await supabase.from('student_leaves').insert({
    student_id: ctx.student.id,
    school_id: ctx.student.school_id,
    from_day: fromDay,
    to_day: toDay,
    reason,
  })
  if (error) return { error: error.message }

  revalidatePath('/student/leave')
  revalidatePath('/student/attendance')
  return {}
}

/** Taking a request back while it is still only a request (0157).
 *
 *  RLS is the authority on "still pending" — a decided request returns zero
 *  rows here rather than being deleted. */
export async function withdrawLeave(id: string): Promise<{ error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' satisfies LeaveError }

  const supabase = await createClient()
  const { data, error } = await supabase.from('student_leaves').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'notPending' satisfies LeaveError }

  revalidatePath('/student/leave')
  revalidatePath('/student/attendance')
  return {}
}
