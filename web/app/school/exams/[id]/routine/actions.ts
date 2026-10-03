'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { overlappingRoutineEntry } from '@/lib/exam-setup'

// RLS + exam_routine_entry_same_school (same-school tenancy + Closed-exam
// guard, migration 0039) are the authority.

function pagePath(examId: string): string {
  return `/school/exams/${examId}/routine`
}

function optId(v: FormDataEntryValue | null | undefined): string | null {
  const s = String(v ?? '').trim()
  return s.length ? s : null
}

/** Why an entry was refused before reaching the database — a code, so the form
 *  can say it in the reader's language (the raw English string used to reach a
 *  Bangla screen, audit AC9). */
export type RoutineEntryRefusal = 'required' | 'timeOrder' | 'overlap'

export async function addRoutineEntry(
  examId: string,
  formData: FormData,
): Promise<{ error?: string; refused?: RoutineEntryRefusal }> {
  const subjectId = optId(formData.get('subject_id'))
  const examDate = optId(formData.get('exam_date'))
  const startTime = optId(formData.get('start_time'))
  const endTime = optId(formData.get('end_time'))
  const roomId = optId(formData.get('room_id'))
  if (!subjectId || !examDate || !startTime || !endTime) return { error: 'Required field missing', refused: 'required' }
  if (endTime <= startTime) return { error: 'End time must be after start time', refused: 'timeOrder' }

  const supabase = await createClient()
  // One exam is one class, so two of its sittings overlapping puts the same
  // students in two papers at once. Checked here because the table has no
  // such constraint; a routine is a few dozen rows at most.
  const { data: existing, error: readError } = await supabase
    .from('exam_routine_entries')
    .select('subject_id, exam_date, start_time, end_time')
    .eq('exam_id', examId)
    .limit(500)
  if (readError) return { error: readError.message }
  if (
    overlappingRoutineEntry(existing ?? [], {
      subject_id: subjectId,
      exam_date: examDate,
      start_time: startTime,
      end_time: endTime,
    })
  ) {
    return { error: 'Overlaps another sitting', refused: 'overlap' }
  }

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
