'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS + exam_routine_entry_same_school (same-school tenancy + Closed-exam
// guard, migration 0039) are the authority.

function pagePath(examId: string): string {
  return `/school/exams/${examId}/routine`
}

function optId(v: FormDataEntryValue | null | undefined): string | null {
  const s = String(v ?? '').trim()
  return s.length ? s : null
}

export async function addRoutineEntry(examId: string, formData: FormData): Promise<{ error?: string }> {
  const subjectId = optId(formData.get('subject_id'))
  const examDate = optId(formData.get('exam_date'))
  const startTime = optId(formData.get('start_time'))
  const endTime = optId(formData.get('end_time'))
  const roomId = optId(formData.get('room_id'))
  if (!subjectId) return { error: 'Subject is required' }
  if (!examDate) return { error: 'Date is required' }
  if (!startTime || !endTime) return { error: 'Start and end time are required' }
  if (endTime <= startTime) return { error: 'End time must be after start time' }

  const supabase = await createClient()
  const { error } = await supabase.from('exam_routine_entries').upsert(
    {
      exam_id: examId,
      subject_id: subjectId,
      exam_date: examDate,
      start_time: startTime,
      end_time: endTime,
      room_id: roomId,
    },
    { onConflict: 'exam_id,subject_id' },
  )
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}

export async function removeRoutineEntry(examId: string, entryId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('exam_routine_entries').delete().eq('id', entryId)
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}
