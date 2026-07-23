'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { smsGateway } from '@/lib/sms/gateway'
import { photoExtension, behaviourSmsBody } from '@/lib/students'

// RLS scopes everything to the caller's School; the 3-day lock trigger is the
// authority for edit rejection, the assign_student_roll trigger for auto-roll.

const LIST = '/school/students'

function parseRating(value: FormDataEntryValue | null): number | null {
  const rating = Number(value)
  return Number.isFinite(rating) && rating >= 0 && rating <= 10 && value !== null && value !== ''
    ? rating
    : null
}

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? '').trim() || null
}

/** The full admission-profile columns shared by admit and edit. */
function profileFields(formData: FormData) {
  return {
    class_name: text(formData, 'class_name'),
    section: text(formData, 'section'),
    gender: text(formData, 'gender'),
    date_of_birth: text(formData, 'date_of_birth'),
    blood_group: text(formData, 'blood_group'),
    religion: text(formData, 'religion'),
    student_mobile: text(formData, 'student_mobile'),
    village: text(formData, 'village'),
    union_name: text(formData, 'union_name'),
    upazila: text(formData, 'upazila'),
    district: text(formData, 'district'),
    guardian_name: text(formData, 'guardian_name'),
    guardian_relation: text(formData, 'guardian_relation'),
    guardian_mobile: text(formData, 'guardian_mobile'),
    // Absence SMS (issue #31) reads guardian_phone — keep it in sync.
    guardian_phone: text(formData, 'guardian_mobile'),
    guardian_nid: text(formData, 'guardian_nid'),
    is_freedom_fighter_child: formData.get('is_freedom_fighter_child') === 'on',
    is_indigenous: formData.get('is_indigenous') === 'on',
    previous_institute: text(formData, 'previous_institute'),
    previous_class: text(formData, 'previous_class'),
    sibling_info: text(formData, 'sibling_info'),
  }
}

/** Admission (issue #27): roll_number left null so the trigger assigns the
 *  next roll within the School+class. Returns the new id for photo upload. */
export async function admitStudent(
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .insert({ full_name: name, ...profileFields(formData) })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(LIST)
  return { id: data.id }
}

export async function updateStudent(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Student is required' }
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ full_name: name, ...profileFields(formData) })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Student not found' }
  revalidatePath(LIST)
  revalidatePath(`${LIST}/${id}`)
  return {}
}

/** Old Students soft-archive (§5.1) — the row stays for history/reports. */
export async function archiveStudent(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Student not found' }
  revalidatePath(LIST)
  revalidatePath(`${LIST}/${id}`)
  revalidatePath(`${LIST}/archive`)
  return {}
}

export async function restoreStudent(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ archived_at: null })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Student not found' }
  revalidatePath(LIST)
  revalidatePath(`${LIST}/${id}`)
  revalidatePath(`${LIST}/archive`)
  return {}
}

/** Class/section transfer: goes through the transfer_student RPC so the history
 *  row and the student update commit in a single transaction — otherwise a
 *  failure between two separate writes could leave an orphaned history row
 *  claiming a transfer that never applied. */
export async function transferStudent(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Student is required' }
  const toClass = text(formData, 'to_class')
  if (!toClass) return { error: 'New class is required' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('transfer_student', {
    p_student_id: id,
    p_to_class: toClass,
    p_to_section: text(formData, 'to_section'),
    p_note: text(formData, 'note'),
  })
  if (error) return { error: error.message }
  revalidatePath(LIST)
  revalidatePath(`${LIST}/${id}`)
  revalidatePath(`${LIST}/${id}/transfer`)
  return {}
}

/** Server-derived Storage path for a student photo (mirrors the syllabus
 *  pattern: client uploads the bytes, path is never trusted from the client). */
export async function studentPhotoPath(
  studentId: string,
  mimeType: string,
): Promise<{ path?: string; error?: string }> {
  const ext = photoExtension(mimeType)
  if (!ext) return { error: 'JPEG, PNG or WebP only' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .maybeSingle()
  if (!student) return { error: 'Student not found' }
  return { path: `${profile.school_id}/${studentId}.${ext}` }
}

/** Records the uploaded photo's path on the student row (after upload). */
export async function recordStudentPhoto(
  studentId: string,
  mimeType: string,
): Promise<{ error?: string }> {
  const { path, error: pathError } = await studentPhotoPath(studentId, mimeType)
  if (pathError || !path) return { error: pathError ?? 'Student not found' }
  const supabase = await createClient()
  const { error } = await supabase.from('students').update({ photo_path: path }).eq('id', studentId)
  if (error) return { error: error.message }
  revalidatePath(`${LIST}/${studentId}`)
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
  if (entry.rating === null) return { error: 'Entry has no rating — cannot compose SMS' }
  if (!entry.note) return { error: 'Entry has no note — cannot compose SMS' }

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
    // Send Log (issue #36) groups sms_log rows by kind/recipient_label; give
    // this single-recipient send a real label instead of falling through to
    // the compose screen's "Manual Numbers" default.
    recipient_label: student.full_name,
  })
  // The SMS is already sent — a log-insert failure must not surface as a
  // retryable error, or the guardian gets a duplicate message on retry.
  if (error) console.error('sms_log insert failed after successful send', error)
  return {}
}
