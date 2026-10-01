import type { SupabaseClient } from '@supabase/supabase-js'

export type EnrolledPerson = { student_id: string } | { employee_id: string }

/** Enrolls one person with an RFID card in machine_enroll_infos (0211) —
 *  the single card source reconcile_attendance resolves taps through. Looks
 *  up the person's machine unique_id first, because the enrollment's
 *  composite FK requires it to match the person's own. */
export async function enrollCard(client: SupabaseClient, person: EnrolledPerson, card: string) {
  const type = 'student_id' in person ? 'student' : 'employee'
  const personId = 'student_id' in person ? person.student_id : person.employee_id
  const { data } = await client
    .from(type === 'student' ? 'students' : 'employees')
    .select('unique_id')
    .eq('id', personId)
    .single()
  return client
    .from('machine_enroll_infos')
    .insert({ type, ...person, unique_id: data!.unique_id, rfid_card_number: card })
}

export async function unenrollCards(client: SupabaseClient, cards: string[]) {
  return client.from('machine_enroll_infos').delete().in('rfid_card_number', cards)
}
