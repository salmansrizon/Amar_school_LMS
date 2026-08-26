// Profile correction requests (#456), kept pure.
//
// A Student never edits a school record — they ask. The whitelist below is the
// same one the CHECK constraint and apply_profile_change_request enforce
// (0149); this copy exists so the form can refuse early and legibly, not so it
// can decide. The database holds the pen.

export const CORRECTABLE_FIELDS = [
  'student_mobile',
  'blood_group',
  'religion',
  'village',
  'union_name',
  'upazila',
  'district',
  'guardian_name',
  'guardian_relation',
  'guardian_mobile',
  'photo_path',
] as const

export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number]

/** Fields a Student may never correct this way, and why — kept explicit so the
 *  next person asking "can we add full_name?" finds the reasoning, not silence. */
export const NEVER_CORRECTABLE: Record<string, string> = {
  roll_number: 'rewritten at promotion by transfer_student',
  student_no: 'immutable, and half the login address',
  class_name: 'belongs to admission and transfer',
  section: 'belongs to admission and transfer',
  date_of_birth: 'an admission record, not a contact detail',
  full_name: 'an identity document, not a contact detail',
  guardian_nid: 'an identity document',
}

export function isCorrectable(field: string): field is CorrectableField {
  return (CORRECTABLE_FIELDS as readonly string[]).includes(field)
}

export type CorrectionRejection = 'field' | 'value' | 'unchanged' | null

/**
 * Why a request would be refused, or null.
 *
 * "unchanged" matters: a request whose value already matches the record gives
 * the Owner a queue item that does nothing, and the Student no feedback about
 * why nothing happened.
 */
export function rejectCorrection(input: {
  field: string
  requestedValue: string
  currentValue: string | null
}): CorrectionRejection {
  if (!isCorrectable(input.field)) return 'field'
  if (!input.requestedValue.trim()) return 'value'
  if (input.requestedValue.trim() === (input.currentValue ?? '').trim()) return 'unchanged'
  return null
}

export interface CorrectionRequest {
  id: string
  field: string
  current_value: string | null
  requested_value: string
  note: string | null
  status: 'pending' | 'applied' | 'rejected'
  reject_reason: string | null
  created_at: string
  resolved_at: string | null
}

/** Pending first — those are the ones anybody can still act on — then newest. */
export function sortRequests(requests: CorrectionRequest[]): CorrectionRequest[] {
  return [...requests].sort(
    (a, b) =>
      Number(b.status === 'pending') - Number(a.status === 'pending') ||
      b.created_at.localeCompare(a.created_at),
  )
}

/** A photo request stores a storage path, not a value a human should read. */
export function isPhotoRequest(request: { field: string }): boolean {
  return request.field === 'photo_path'
}
