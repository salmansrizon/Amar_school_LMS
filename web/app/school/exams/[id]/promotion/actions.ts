'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { archiveStudent } from '@/app/school/students/actions'

// Promotion (rewired onto the Enrollment model, map #568/#582's Wave 3, issue
// #586): a "Promote Selected" click is one set_student_enrollment call per
// checked student (#573/#585, outcome='promoted') — an app-layer loop, not
// one giant transaction across students, the same shape #46's "bulk assign
// all" and this file's own pre-existing per-student loop already used
// (preserved deliberately, per #574's own confirmed decision not to
// introduce a bulk RPC). sync_student_legacy_placement is still called
// second, per student (student_transfers is retired, Wave 6/#591 — the
// history now lives solely on student_enrollments.note, set by the call
// above), purely to keep students.class_name/section/roll_number in sync —
// same transitional-bridge reasoning as transferStudent's own two-RPC shape
// (actions.ts under app/school/students), and for the identical reason:
// sync_student_legacy_placement has no capacity check of its own, so it must
// never be the one that decides whether a promotion is authorized.
//
// "Repeat" stays exactly as before this wave: a repeated (failed) Student
// gets NO RPC call at all and keeps their current Enrollment untouched. This
// table has only one destination-class picker for the whole batch, shared by
// every passed Student; #574's resolution treats 'repeated' as its own
// outcome value with its own (typically same-grade, next-year) target
// Offering, which this UI has no picker for at all. Wiring that requires a
// second, repeat-specific destination control — a real UI addition, not a
// rewiring — so it's flagged rather than invented here, matching this wave's
// own posted plan.
//
// "Make Old" reuses the existing archiveStudent action (issue #27's Old
// Students soft-archive, now also closing the Enrollment per #574 — see its
// own comment in app/school/students/actions.ts) rather than a new archive path.

function pagePath(examId: string): string {
  return `/school/exams/${examId}/promotion`
}

export interface PromotionItem {
  studentId: string
  newRoll: number | null
}

export interface BulkResult {
  error?: string
  failedCount?: number
}

export async function promoteStudents(
  examId: string,
  classOfferingId: string,
  items: PromotionItem[],
): Promise<BulkResult> {
  if (!classOfferingId) return { error: 'A destination class is required' }
  if (!items.length) return {}

  const supabase = await createClient()
  const { data: offering } = await supabase
    .from('class_offerings')
    .select('name, section')
    .eq('id', classOfferingId)
    .maybeSingle()
  if (!offering) return { error: 'Class not found' }

  let failedCount = 0
  let lastError: string | null = null
  for (const item of items) {
    const { data: enrollmentId, error: enrollError } = await supabase.rpc('set_student_enrollment', {
      p_student_id: item.studentId,
      p_class_offering_id: classOfferingId,
      p_roll_number: item.newRoll,
      p_outcome_for_previous: 'promoted',
      p_note: 'Promotion',
    })
    if (enrollError) {
      failedCount += 1
      lastError = enrollError.message
      continue
    }

    const { data: enrollment } = await supabase
      .from('student_enrollments')
      .select('roll_number')
      .eq('id', enrollmentId)
      .maybeSingle()

    const { error } = await supabase.rpc('sync_student_legacy_placement', {
      p_student_id: item.studentId,
      p_to_class: offering.name,
      p_to_section: offering.section,
      p_new_roll: enrollment?.roll_number ?? item.newRoll,
    })
    if (error) {
      failedCount += 1
      lastError = `Promoted, but the legacy record failed to sync: ${error.message}`
    }
  }
  revalidatePath(pagePath(examId))
  revalidatePath('/school/students')
  if (failedCount) return { error: lastError ?? 'Some students could not be promoted', failedCount }
  return {}
}

/** "Make Old" (the graduating batch): Leaving AND archiving, both fired per
 *  student, per #574's explicit "stays conceptually separate — neither call
 *  implies the other". This is the one surface where closing the Enrollment
 *  belongs: unlike the per-student archive toggle (archiveStudent, which
 *  restoreStudent must be able to undo), graduating is terminal, so there is
 *  nothing to reopen. */
export async function makeOldStudents(examId: string, studentIds: string[]): Promise<BulkResult> {
  if (!studentIds.length) return {}
  const supabase = await createClient()
  let failedCount = 0
  let lastError: string | null = null
  for (const id of studentIds) {
    const { error: closeError } = await supabase.rpc('close_student_enrollment', {
      p_student_id: id,
      p_note: 'Graduated (Make Old)',
    })
    // A student with no current Enrollment (pre-Wave-6 data, or one already
    // closed) is not a failure — there is simply nothing to close. Anything
    // else is, and is counted before the archive is attempted.
    if (closeError && !closeError.message.includes('no current enrollment to close')) {
      failedCount += 1
      lastError = closeError.message
      continue
    }
    const result = await archiveStudent(id)
    if (result.error) {
      failedCount += 1
      lastError = result.error
    }
  }
  revalidatePath(pagePath(examId))
  if (failedCount) return { error: lastError ?? 'Some students could not be archived', failedCount }
  return {}
}

// "Make Old" (promotion-transfer.html's Graduating Batch section) is only
// meaningful for a genuine graduating/terminal class — classes (issue #26)
// carries no such marker, so this ticket adds the smallest one
// (classes.is_final_class, migration 0050) and this toggle sets it, rather
// than leaving every exam's passed students archivable regardless of class.
export async function setClassFinal(examId: string, classId: string, isFinal: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('class_offerings').update({ is_final_class: isFinal }).eq('id', classId)
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}
