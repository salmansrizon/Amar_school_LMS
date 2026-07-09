// Shared option lists for the Student admission profile (§5.1, issue #27).

export const GENDERS = [
  { value: 'male', bn: 'ছেলে', en: 'Male' },
  { value: 'female', bn: 'মেয়ে', en: 'Female' },
  { value: 'other', bn: 'অন্যান্য', en: 'Other' },
] as const

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const

export const GUARDIAN_RELATIONS = [
  { value: 'father', bn: 'বাবা', en: 'Father' },
  { value: 'mother', bn: 'মা', en: 'Mother' },
  { value: 'other', bn: 'অন্যান্য', en: 'Other' },
] as const

// Columns the admission/edit forms write. Kept in one place so the server action
// and the form component stay in sync.
export interface StudentProfile {
  full_name: string
  class_name: string | null
  section: string | null
  shift_id: string | null
  roll_number: number | null
  gender: string | null
  date_of_birth: string | null
  blood_group: string | null
  religion: string | null
  student_mobile: string | null
  village: string | null
  union_name: string | null
  upazila: string | null
  district: string | null
  guardian_name: string | null
  guardian_relation: string | null
  guardian_mobile: string | null
  guardian_nid: string | null
  is_freedom_fighter_child: boolean
  is_indigenous: boolean
  previous_institute: string | null
  previous_class: string | null
  sibling_info: string | null
}
