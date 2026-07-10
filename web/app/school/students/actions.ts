'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { photoExtension } from '@/lib/students'

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
    shift_id: text(formData, 'shift_id'),
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
  revalidatePath(`${LIST}/archive`)
  return {}
}

/** Class/shift transfer: records the history row, then moves the student.
 *  Roll is reset on a class change so rolls stay per class (an explicit roll
 *  can be set afterwards via edit). */
export async function transferStudent(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Student is required' }
  const toClass = text(formData, 'to_class')
  const toSection = text(formData, 'to_section')
  const toShift = text(formData, 'to_shift_id')
  if (!toClass) return { error: 'New class is required' }

  const supabase = await createClient()
  const { data: current } = await supabase
    .from('students')
    .select('class_name, section, shift_id')
    .eq('id', id)
    .maybeSingle()
  if (!current) return { error: 'Student not found' }

  const { error: histError } = await supabase.from('student_transfers').insert({
    student_id: id,
    from_class: current.class_name,
    from_section: current.section,
    from_shift_id: current.shift_id,
    to_class: toClass,
    to_section: toSection,
    to_shift_id: toShift,
    note: text(formData, 'note'),
  })
  if (histError) return { error: histError.message }

  const classChanged = toClass !== current.class_name
  const { error } = await supabase
    .from('students')
    .update({
      class_name: toClass,
      section: toSection,
      shift_id: toShift,
      ...(classChanged ? { roll_number: null } : {}),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(LIST)
  revalidatePath(`${LIST}/${id}`)
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
