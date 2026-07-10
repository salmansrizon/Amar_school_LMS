'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS scopes every write to the caller's School; the partial unique indexes
// (teacher/room per day+period) and the same-school trigger are the authority
// on conflicts and tenancy. These actions validate shape and translate the
// database's conflict errors into friendly messages.

const PAGE = '/school/classes/routine'

function optId(v: FormDataEntryValue | null | undefined): string | null {
  const s = String(v ?? '').trim()
  return s.length ? s : null
}

function conflictMessage(message: string): string {
  if (message.includes('routine_slots_teacher_conflict')) {
    return 'That teacher is already assigned in this day/period.'
  }
  if (message.includes('routine_slots_room_conflict')) {
    return 'That room is already used in this day/period.'
  }
  return message
}

export async function setSlot(formData: FormData): Promise<{ error?: string }> {
  const classId = optId(formData.get('class_id'))
  const day = Number(formData.get('day_of_week'))
  const period = Number(formData.get('period'))
  if (!classId) return { error: 'Class is required' }
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: 'Invalid day' }
  if (!Number.isInteger(period) || period < 1 || period > 12) return { error: 'Invalid period' }

  const subjectId = optId(formData.get('subject_id'))
  const teacherId = optId(formData.get('teacher_id'))
  const roomId = optId(formData.get('room_id'))

  const supabase = await createClient()

  // An empty cell (nothing assigned) is a clear, not a stored row.
  if (!subjectId && !teacherId && !roomId) {
    const { error } = await supabase
      .from('routine_slots')
      .delete()
      .eq('class_id', classId)
      .eq('day_of_week', day)
      .eq('period', period)
    if (error) return { error: error.message }
    revalidatePath(PAGE)
    return {}
  }

  const { error } = await supabase.from('routine_slots').upsert(
    {
      class_id: classId,
      day_of_week: day,
      period,
      subject_id: subjectId,
      teacher_id: teacherId,
      room_id: roomId,
    },
    { onConflict: 'class_id,day_of_week,period' },
  )
  if (error) return { error: conflictMessage(error.message) }
  revalidatePath(PAGE)
  return {}
}

export async function publishRoutine(classId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('class_routines')
    .upsert({ class_id: classId, published_at: new Date().toISOString() }, { onConflict: 'class_id' })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
