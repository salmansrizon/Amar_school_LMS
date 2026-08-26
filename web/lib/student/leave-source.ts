'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext, isReadOnly } from '@/lib/student/context'

/** A Student asking for leave (#452).
 *
 *  The row lands as 'pending' and joins the SAME queue at
 *  /school/attendance/leave that Attendance I already built — nothing new on
 *  the staff side, per the ticket. Once approved, the existing absent-fine and
 *  absence-SMS rules already excuse the days; none of that is rebuilt here. */
export async function requestLeave(formData: FormData): Promise<{ error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' }

  const fromDay = String(formData.get('from_day') ?? '')
  const toDay = String(formData.get('to_day') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || null

  if (!fromDay || !toDay) return { error: 'From and to dates are required' }
  if (toDay < fromDay) return { error: 'To date must be on or after the from date' }

  const supabase = await createClient()
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
