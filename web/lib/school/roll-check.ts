import type { SupabaseClient } from '@supabase/supabase-js'

// One roll per Class Offering (#690).
//
// A Student has two copies of the roll: the Enrollment's (authoritative, unique
// per Offering among open Enrollments — 0181) and the legacy students.roll_number
// that lists, ID cards and print pages still show (unique per School + class
// name + section text — 0120). The edit form writes only the legacy copy, and
// its index does not apply when the class text is empty or differs, so two
// Students of one Offering could end up SHOWING the same roll with neither
// index firing. This check looks at both copies inside the Offering before a
// roll is written. Migration 0244 repeats it in the database for edits.
//
// It is a pre-check, not the authority: the two unique indexes still decide,
// and any read failure here lets the write go on to them (today's behaviour).

export interface OfferingRoll {
  student_id: string
  /** student_enrollments.roll_number of the open Enrollment */
  enrollment_roll: number | null
  /** students.roll_number, the copy the screens show */
  student_roll: number | null
}

/** Pure: does another Student of the Offering already hold this roll, in
 *  either copy? `exceptStudentId` is the Student being edited. */
export function rollTakenInOffering(
  rows: readonly OfferingRoll[],
  roll: number,
  exceptStudentId: string | null = null,
): boolean {
  return rows.some(
    (r) => r.student_id !== exceptStudentId && (r.enrollment_roll === roll || r.student_roll === roll),
  )
}

/** Both copies of every roll currently held in one Class Offering, or null
 *  when it cannot be read (the caller then skips the pre-check). An archived
 *  Student still holds a roll, as the indexes treat it. */
export async function offeringRolls(supabase: SupabaseClient, classOfferingId: string): Promise<OfferingRoll[] | null> {
  const { data: enrollments, error } = await supabase
    .from('student_enrollments')
    .select('id, student_id, roll_number')
    .eq('class_offering_id', classOfferingId)
    .is('closed_at', null)
  if (error) return null
  if (!enrollments?.length) return []

  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, roll_number, current_enrollment_id')
    .in(
      'current_enrollment_id',
      enrollments.map((e) => e.id as string),
    )
  if (studentsError) return null
  const shown = new Map((students ?? []).map((s) => [s.id as string, s.roll_number as number | null]))
  return enrollments.map((e) => ({
    student_id: e.student_id as string,
    enrollment_roll: e.roll_number as number | null,
    student_roll: shown.get(e.student_id as string) ?? null,
  }))
}

/** True when `roll` is already held in the Offering by someone else. */
export async function rollAlreadyTaken(
  supabase: SupabaseClient,
  classOfferingId: string,
  roll: number,
  exceptStudentId: string | null = null,
): Promise<boolean> {
  const rows = await offeringRolls(supabase, classOfferingId)
  return rows !== null && rollTakenInOffering(rows, roll, exceptStudentId)
}
