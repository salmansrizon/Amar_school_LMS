import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lang } from '@/lib/i18n'
import type { OffDay, RoutineRow } from '@/lib/student/routine'

// The I/O half of the Student's routine (#444). The decisions live next door in
// routine.ts and are pure; this only fetches.
//
// One read, one view: student_routine (0137) already resolves subject, teacher
// and room names and already refuses an unpublished routine, so there is no
// joining to do here and a Student needs no grant on routine_slots, subjects,
// employees or rooms.

export interface StudentRoutine {
  rows: RoutineRow[]
  offDays: OffDay[]
}

/**
 * @param days Which dates to look up closures for — the home screen cares about
 *   today and tomorrow, so it asks for two, not a year.
 */
export async function loadStudentRoutine(
  supabase: SupabaseClient,
  lang: Lang,
  days: string[] = [],
): Promise<StudentRoutine> {
  const [routine, schoolOff, centralOff] = await Promise.all([
    supabase
      .from('student_routine')
      .select('day_of_week, period, subject_name, teacher_name, room_name'),
    days.length
      ? supabase.from('off_days').select('day, label').in('day', days)
      : Promise.resolve({ data: [] as { day: string; label: string | null }[] }),
    days.length
      ? supabase.from('central_off_days').select('day, label_bn, label_en').in('day', days)
      : Promise.resolve({ data: [] as { day: string; label_bn: string | null; label_en: string | null }[] }),
  ])

  // A school closure and a national holiday can land on the same date; the
  // school's own label wins, because it is the one the students were told.
  const offDays = new Map<string, string | null>()
  for (const o of centralOff.data ?? []) {
    offDays.set(o.day, (lang === 'bn' ? o.label_bn : o.label_en) ?? null)
  }
  for (const o of schoolOff.data ?? []) offDays.set(o.day, o.label)

  return {
    rows: (routine.data ?? []) as RoutineRow[],
    offDays: [...offDays].map(([day, label]) => ({ day, label })),
  }
}
