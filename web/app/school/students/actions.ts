'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const LIST = '/school/students'

function s(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? '').trim()
  return v.length ? v : null
}

/** Build the admission-profile column set from a form (§5.1, issue #27). */
function profileFromForm(fd: FormData): Record<string, unknown> {
  return {
    class_name: s(fd, 'class_name'),
    section: s(fd, 'section'),
    shift_id: s(fd, 'shift_id'),
    gender: s(fd, 'gender'),
    date_of_birth: s(fd, 'date_of_birth'), // HTML date input yields YYYY-MM-DD or ''
    blood_group: s(fd, 'blood_group'),
    religion: s(fd, 'religion'),
    student_mobile: s(fd, 'student_mobile'),
    village: s(fd, 'village'),
    union_name: s(fd, 'union_name'),
    upazila: s(fd, 'upazila'),
    district: s(fd, 'district'),
    guardian_name: s(fd, 'guardian_name'),
    guardian_relation: s(fd, 'guardian_relation'),
    guardian_mobile: s(fd, 'guardian_mobile'),
    guardian_nid: s(fd, 'guardian_nid'),
    is_freedom_fighter_child: fd.get('is_freedom_fighter_child') != null,
    is_indigenous: fd.get('is_indigenous') != null,
    previous_institute: s(fd, 'previous_institute'),
    previous_class: s(fd, 'previous_class'),
    sibling_info: s(fd, 'sibling_info'),
  }
}

/** Full admission — roll number is auto-assigned by the DB trigger. */
export async function admitStudent(formData: FormData): Promise<{ error?: string; id?: string }> {
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .insert({ full_name: name, ...profileFromForm(formData) })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(LIST)
  return { id: data.id }
}

export async function updateStudent(id: string, formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ full_name: name, ...profileFromForm(formData) })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Student not found or not accessible' }
  revalidatePath(`/school/students/${id}`)
  revalidatePath(LIST)
  return {}
}

export async function archiveStudent(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Student not found or already archived' }
  revalidatePath(`/school/students/${id}`)
  revalidatePath(LIST)
  return {}
}

export async function restoreStudent(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ archived_at: null })
    .eq('id', id)
    .not('archived_at', 'is', null)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Student not found or not archived' }
  revalidatePath(`/school/students/${id}`)
  revalidatePath(LIST)
  return {}
}

/** Move a student to a new class/section/shift and record the history row. */
export async function transferStudent(id: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: cur } = await supabase
    .from('students')
    .select('class_name, section, shift_id')
    .eq('id', id)
    .maybeSingle()
  if (!cur) return { error: 'Student not found or not accessible' }

  const toClass = s(formData, 'to_class')
  const toSection = s(formData, 'to_section')
  const toShift = s(formData, 'to_shift_id')
  if (!toClass && !toSection && !toShift) return { error: 'Choose a new class, section or shift' }

  const { error: upErr } = await supabase
    .from('students')
    .update({ class_name: toClass, section: toSection, shift_id: toShift })
    .eq('id', id)
  if (upErr) return { error: upErr.message }

  const { error: histErr } = await supabase.from('student_transfers').insert({
    student_id: id,
    from_class: cur.class_name,
    from_section: cur.section,
    from_shift_id: cur.shift_id,
    to_class: toClass,
    to_section: toSection,
    to_shift_id: toShift,
    note: s(formData, 'note'),
  })
  if (histErr) return { error: histErr.message }
  revalidatePath(`/school/students/${id}`)
  revalidatePath(LIST)
  return {}
}

/** Canonical Storage path for a student's photo (derived server-side). */
export async function studentPhotoPath(id: string): Promise<{ path?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  const { data: student } = await supabase.from('students').select('id').eq('id', id).maybeSingle()
  if (!student) return { error: 'Student not found' }
  return { path: `${profile.school_id}/${id}.jpg` }
}

/** Records the photo path (re-derived server-side, never trusted from client). */
export async function recordStudentPhoto(id: string): Promise<{ error?: string }> {
  const { path, error: pathErr } = await studentPhotoPath(id)
  if (pathErr || !path) return { error: pathErr ?? 'No school' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ photo_path: path })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Student not found or not accessible' }
  revalidatePath(`/school/students/${id}`)
  return {}
}

// RLS scopes everything to the caller's School; the 3-day lock trigger is the
// authority for edit rejection.

function parseRating(value: FormDataEntryValue | null): number | null {
  const rating = Number(value)
  return Number.isFinite(rating) && rating >= 0 && rating <= 10 && value !== null && value !== ''
    ? rating
    : null
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
