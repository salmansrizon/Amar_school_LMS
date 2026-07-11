'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS + enforce_exam_seat_plan_school (same-school tenancy, room-capacity
// check, Closed-exam guard) are the authority for row writes. Publishing goes
// through publish_seat_plan (server-side duplicate-range/overlap check —
// "not just client validation" per the ticket) and Generate through
// generate_seat_plan (both migration 0039), one transaction each.

function pagePath(examId: string): string {
  return `/school/exams/${examId}/seat-plan`
}

export async function saveSeatPlanRow(examId: string, formData: FormData): Promise<{ error?: string }> {
  const roomId = String(formData.get('room_id') ?? '').trim()
  const rollStart = Number(formData.get('roll_start'))
  const rollEnd = Number(formData.get('roll_end'))
  if (!roomId) return { error: 'Room is required' }
  if (!Number.isInteger(rollStart) || rollStart < 1) return { error: 'Invalid roll start' }
  if (!Number.isInteger(rollEnd) || rollEnd < rollStart) return { error: 'Roll end must be >= roll start' }

  const supabase = await createClient()
  const { error } = await supabase.from('exam_seat_plans').upsert(
    { exam_id: examId, room_id: roomId, roll_start: rollStart, roll_end: rollEnd },
    { onConflict: 'exam_id,room_id' },
  )
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}

export async function removeSeatPlanRow(examId: string, rowId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('exam_seat_plans').delete().eq('id', rowId)
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}

export async function generateSeatPlan(examId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('generate_seat_plan', { exam: examId })
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}

export async function publishSeatPlan(examId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('publish_seat_plan', { exam: examId })
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}
