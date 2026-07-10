'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { smsGateway } from '@/lib/sms/gateway'
import { behaviourSmsBody } from '@/lib/students'

// RLS scopes everything to the caller's School; the 3-day lock trigger is the
// authority for edit rejection.

function parseRating(value: FormDataEntryValue | null): number | null {
  const rating = Number(value)
  return Number.isFinite(rating) && rating >= 0 && rating <= 10 && value !== null && value !== ''
    ? rating
    : null
}

export async function addStudent(formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const supabase = await createClient()
  const { error } = await supabase.from('students').insert({
    full_name: name,
    class_name: String(formData.get('class_name') ?? '').trim() || null,
    section: String(formData.get('section') ?? '').trim() || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/school/students')
  return {}
}

export async function addBehaviourEntry(formData: FormData): Promise<{ error?: string }> {
  const studentId = String(formData.get('student_id') ?? '').trim()
  if (!studentId) return { error: 'Student is required' }
  const note = String(formData.get('note') ?? '').trim()
  if (!note) return { error: 'Note is required' }
  const rating = parseRating(formData.get('rating'))
  if (rating === null) return { error: 'Rating must be between 0 and 10' }

  const supabase = await createClient()
  const { error } = await supabase.from('behaviour_log_entries').insert({
    student_id: studentId,
    note,
    rating,
    remind_date: String(formData.get('remind_date') ?? '') || null,
  })
  if (error) return { error: error.message }
  revalidatePath(`/school/students/${studentId}`)
  return {}
}

export async function updateBehaviourEntry(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  const studentId = String(formData.get('student_id') ?? '').trim()
  if (!id || !studentId) return { error: 'Entry is required' }
  const note = String(formData.get('note') ?? '').trim()
  if (!note) return { error: 'Note is required' }
  const rating = parseRating(formData.get('rating'))
  if (rating === null) return { error: 'Rating must be between 0 and 10' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('behaviour_log_entries')
    .update({
      note,
      rating,
      remind_date: String(formData.get('remind_date') ?? '') || null,
    })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'entry not updated' }
  revalidatePath(`/school/students/${studentId}`)
  return {}
}

/** Send a behaviour record's note/rating to the student's guardian (issue #46). */
export async function sendBehaviourSms(entryId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: entry } = await supabase
    .from('behaviour_log_entries')
    .select('note, rating, student_id')
    .eq('id', entryId)
    .maybeSingle()
  if (!entry) return { error: 'Entry not found' }

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, guardian_phone, school_id')
    .eq('id', entry.student_id)
    .maybeSingle()
  if (!student) return { error: 'Student not found' }
  if (!student.guardian_phone) return { error: 'No guardian phone on file for this student' }

  const body = behaviourSmsBody(student.full_name, entry.note, entry.rating)
  const gateway = smsGateway()
  const result = await gateway.send(student.guardian_phone, body)
  if (!result.ok) return { error: 'SMS gateway failed to send' }

  const { error } = await supabase.from('sms_log').insert({
    school_id: student.school_id,
    student_id: student.id,
    sent_on: new Date().toISOString().slice(0, 10),
    phone: student.guardian_phone,
    body,
    provider: gateway.name,
  })
  if (error) return { error: error.message }
  return {}
}
