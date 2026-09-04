'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { currentActor } from '@/lib/school/actor'
import { sendStudentSms } from '@/lib/sms/student-sms'
import { photoExtension, behaviourSmsBody, parseRollNumber, rollScopeChanged, friendlyStudentError } from '@/lib/students'
import { createSignedUpload, type SignedUpload } from '@/lib/storage/signed-upload'

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

/** The full admission-profile columns shared by admit and edit — everything
 *  except roll_number, whose null-handling differs between the two (see
 *  admitStudent/updateStudent). */
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
    // Attendance-machine data-model prep (#564/#565) — plain text via the
    // same text() helper as every other optional field here, so a blank
    // submission is null, not '' (the partial unique index on
    // (school_id, rfid_card_number) is keyed off "is not null").
    rfid_card_number: text(formData, 'rfid_card_number'),
  }
}

/** Admission (issue #27, rewired onto the Enrollment model in map #568/#582's
 *  Wave 3, issue #586): the form's class picker is now the id-based Class
 *  Offering select (admission-form.tsx's ProfileFields, `usingOfferings`
 *  mode) — this submits `class_offering_id`, not class_name/section text.
 *  Placement is a two-step write, matching #572's resolution: (1) the
 *  `students` row for personal-data fields, (2) admit_student_enrollment for
 *  the initial Enrollment — the sole sanctioned placement-creating primitive
 *  (#573/#585). Direct writes to students.current_enrollment_id are refused
 *  by a DB trigger (0180) regardless of what this action does; only the RPC
 *  can set it.
 *
 *  students.class_name/section/roll_number stay populated too, as a
 *  denormalized copy synced from the chosen Offering/the Enrollment RPC's
 *  own roll assignment — student_enrollments/current_enrollment_id is the
 *  sole AUTHORITATIVE placement (capacity/RLS reads it exclusively, per
 *  Wave 2), but a long tail of still-unmigrated screens (the student portal's
 *  own class_name/section-keyed views, roll-numbered rosters, print layouts
 *  — Wave 4's job) still reads these columns directly, and leaving them null
 *  would silently break every one of those for every student admitted from
 *  today onward. This sync is a deliberate transitional bridge, not a
 *  competing source of truth — updateStudent's own class_name/section edit
 *  path (unchanged, see its own comment) is NOT part of this sync loop, so an
 *  edit after admission can still drift the two apart; that gap is accepted
 *  here and left for Wave 4 to close for good.
 *
 *  Roll Number: the form prefills a placeholder computed from
 *  student_enrollments (issue #503's UI hint, now offering-scoped), but a
 *  blank field still falls through to admit_student_enrollment's own
 *  assign_enrollment_roll trigger (0181) so a school without JS-computed
 *  rolls keeps working. Returns the new id for photo upload. */
export async function admitStudent(
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const classOfferingId = String(formData.get('class_offering_id') ?? '').trim()
  const roll = parseRollNumber(String(formData.get('roll_number') ?? ''))
  if (roll.error) return { error: roll.error }
  const supabase = await createClient()

  let className: string | null = null
  let section: string | null = null
  if (classOfferingId) {
    const { data: offering } = await supabase
      .from('class_offerings')
      .select('name, section')
      .eq('id', classOfferingId)
      .maybeSingle()
    if (!offering) return { error: 'Class not found' }
    className = offering.name
    section = offering.section
  }

  const { data, error } = await supabase
    .from('students')
    .insert({
      full_name: name,
      roll_number: roll.value,
      ...profileFields(formData),
      class_name: className,
      section,
    })
    .select('id')
    .single()
  if (error) return { error: friendlyStudentError(error) }

  if (classOfferingId) {
    const { data: enrollmentId, error: enrollError } = await supabase.rpc('admit_student_enrollment', {
      p_student_id: data.id,
      p_class_offering_id: classOfferingId,
      p_roll_number: roll.value,
      p_note: null,
    })
    if (enrollError) {
      // Undo the student row rather than leaving one behind unplaced. The two
      // writes cannot be one transaction (the placement is a definer RPC), so
      // the compensating delete is what keeps a failure retryable: the form
      // reports an error and the operator resubmits, and without this every
      // retry would leave another unplaced duplicate. A Class Teacher hits
      // this path on every attempt — admit_student_enrollment is Owner and
      // office-staff only (ADR 0021), while the students insert above is not.
      await supabase.from('students').delete().eq('id', data.id)
      return { error: `Admission failed: ${enrollError.message}` }
    }
    // Sync the roll Enrollment actually assigned (auto or explicit) back
    // onto students.roll_number, so the denormalized copy always matches
    // what admit_student_enrollment/assign_enrollment_roll decided, not just
    // what this action guessed before calling it.
    const { data: enrollment } = await supabase
      .from('student_enrollments')
      .select('roll_number')
      .eq('id', enrollmentId)
      .maybeSingle()
    if (enrollment && enrollment.roll_number !== roll.value) {
      const { error: syncError } = await supabase
        .from('students')
        .update({ roll_number: enrollment.roll_number })
        .eq('id', data.id)
      // Surfaced rather than swallowed: if this fails, the two copies of the
      // roll genuinely disagree, which is precisely what the sync exists to
      // prevent. The Student and their Enrollment both exist and are correct,
      // so the admission is not undone — the operator is told to check the
      // roll instead.
      if (syncError) {
        revalidatePath(LIST)
        return { id: data.id, error: `Admitted, but the roll number did not sync: ${syncError.message}` }
      }
    }
  }

  revalidatePath(LIST)
  return { id: data.id }
}

export async function updateStudent(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Student is required' }
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const roll = parseRollNumber(String(formData.get('roll_number') ?? ''))
  if (roll.error) return { error: roll.error }
  const fields = profileFields(formData)
  const supabase = await createClient()

  // An explicit roll always wins; a blank one only keeps the existing roll
  // when class+section haven't actually changed (rollScopeChanged) —
  // otherwise the old roll would silently ride along into a class+section it
  // was never computed for.
  const { data: current } = await supabase
    .from('students')
    .select('class_name, section')
    .eq('id', id)
    .maybeSingle()
  const scopeChanged = rollScopeChanged(current, fields)

  const { data, error } = await supabase
    .from('students')
    .update({
      full_name: name,
      ...(roll.value !== null ? { roll_number: roll.value } : scopeChanged ? { roll_number: null } : {}),
      ...fields,
    })
    .eq('id', id)
    .select('id')
  if (error) return { error: friendlyStudentError(error) }
  if (!data?.length) return { error: 'Student not found' }
  revalidatePath(LIST)
  revalidatePath(`${LIST}/${id}`)
  return {}
}

/** Old Students soft-archive (§5.1) — the row stays for history/reports.
 *
 *  Deliberately does NOT close the student's Enrollment: this is the
 *  reversible per-student toggle (restoreStudent is its exact inverse), and
 *  there is no "reopen" primitive to undo a close with, so closing here would
 *  make archive/restore asymmetric — a restored student would come back with
 *  no placement at all, out of their Class Teacher's reach. Leaving (#574) is
 *  a separate act on a separate surface: makeOldStudents (the graduating-batch
 *  "Make Old" flow) is where close_student_enrollment fires, per #586's own
 *  item 4. */
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

/** Transfer (rewired onto the Enrollment model, map #568/#582's Wave 3, issue
 *  #586): the id-based Class Offering picker submits `class_offering_id`.
 *  set_student_enrollment (#573/#585) is the real placement change and the
 *  real authorization gate — it must run FIRST, before anything else touches
 *  the legacy columns, because the old transfer_student RPC (still called
 *  below) performs NO capacity check at all. Calling transfer_student first
 *  would let an unauthorized actor still mutate students.class_name/section
 *  even when the actual Enrollment change is correctly refused.
 *
 *  student_transfers' retirement in favor of student_enrollments' own history
 *  is explicitly undecided (flagged in this wave's plan, not resolved here),
 *  so transfer_student is kept as a second call purely to preserve its
 *  history log and keep students.class_name/section/roll_number in sync —
 *  same transitional-bridge reasoning as admitStudent's own denormalized
 *  sync. p_new_roll is set to whatever set_student_enrollment/
 *  assign_enrollment_roll actually assigned, so the legacy roll_number
 *  column never disagrees with student_enrollments' own. Individually-safe
 *  two-step write: the Enrollment change is what's authoritative and already
 *  committed by the time this second call runs; a failure here only leaves
 *  the legacy columns/history stale, not the placement itself. */
export async function transferStudent(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Student is required' }
  const classOfferingId = String(formData.get('class_offering_id') ?? '').trim()
  if (!classOfferingId) return { error: 'New class is required' }
  const note = text(formData, 'note')

  const supabase = await createClient()
  const { data: offering } = await supabase
    .from('class_offerings')
    .select('name, section')
    .eq('id', classOfferingId)
    .maybeSingle()
  if (!offering) return { error: 'Class not found' }

  const { data: enrollmentId, error: enrollError } = await supabase.rpc('set_student_enrollment', {
    p_student_id: id,
    p_class_offering_id: classOfferingId,
    p_roll_number: null,
    p_outcome_for_previous: 'transferred',
    p_note: note,
  })
  if (enrollError) return { error: enrollError.message }

  const { data: enrollment } = await supabase
    .from('student_enrollments')
    .select('roll_number')
    .eq('id', enrollmentId)
    .maybeSingle()

  const { error } = await supabase.rpc('transfer_student', {
    p_student_id: id,
    p_to_class: offering.name,
    p_to_section: offering.section,
    p_note: note,
    p_new_roll: enrollment?.roll_number ?? null,
  })
  if (error) return { error: `Transferred, but the history/legacy record failed to sync: ${error.message}` }

  revalidatePath(LIST)
  revalidatePath(`${LIST}/${id}`)
  revalidatePath(`${LIST}/${id}/transfer`)
  return {}
}

/** Server-derived Storage path for a student photo (mirrors the syllabus
 *  pattern: client uploads the bytes, path is never trusted from the client). */
/** The deterministic object path for a student's photo.
 *
 *  Shared by the upload ticket and by recordStudentPhoto, which needs the same
 *  string afterwards. Split out when the ticket started minting a signed token:
 *  re-calling the exported function to recompute a path would have issued a fresh
 *  upload credential purely as a side effect of wanting a filename. */
async function studentPhotoObjectPath(
  studentId: string,
  mimeType: string,
): Promise<{ path?: string; error?: string }> {
  const ext = photoExtension(mimeType)
  if (!ext) return { error: 'JPEG, PNG or WebP only' }
  const actor = await currentActor()
  if ('error' in actor) return { error: actor.error }
  const { data: student } = await actor.supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .maybeSingle()
  if (!student) return { error: 'Student not found' }
  return { path: `${actor.schoolId}/${studentId}.${ext}` }
}

export async function studentPhotoUploadTicket(
  studentId: string,
  mimeType: string,
): Promise<{ upload?: SignedUpload; error?: string }> {
  const { path, error } = await studentPhotoObjectPath(studentId, mimeType)
  if (error || !path) return { error: error ?? 'Student not found' }
  return createSignedUpload('student-photos', path)
}

/** Records the uploaded photo's path on the student row (after upload). */
export async function recordStudentPhoto(
  studentId: string,
  mimeType: string,
): Promise<{ error?: string }> {
  const { path, error: pathError } = await studentPhotoObjectPath(studentId, mimeType)
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
  if (entry.rating === null) return { error: 'Entry has no rating — cannot compose SMS' }
  if (!entry.note) return { error: 'Entry has no note — cannot compose SMS' }

  const { data: student } = await supabase
    .from('students')
    .select('full_name')
    .eq('id', entry.student_id)
    .maybeSingle()
  if (!student) return { error: 'Student not found' }

  const result = await sendStudentSms(
    supabase,
    entry.student_id,
    behaviourSmsBody(student.full_name, entry.note, entry.rating),
  )
  return result.ok ? {} : { error: result.error }
}
