import type { Role } from '@/lib/auth/routing'

// Screen registry for the School product (PRD §5). A Staff User's access is a
// boolean allow-list over these keys — screen-level only, no per-action
// granularity (issue #2, legacy `sub_user.paths` model).
export const GRANTABLE_SCREENS = [
  { key: 'students', label: { bn: 'শিক্ষার্থী', en: 'Students' } },
  { key: 'employees', label: { bn: 'কর্মচারী', en: 'Employees' } },
  { key: 'attendance', label: { bn: 'উপস্থিতি', en: 'Attendance' } },
  { key: 'classes', label: { bn: 'শ্রেণি ও পাঠ্যক্রম', en: 'Class & Curriculum' } },
  { key: 'exams', label: { bn: 'পরীক্ষা ও ফলাফল', en: 'Exams & Results' } },
  { key: 'fees', label: { bn: 'হিসাব ও ফি', en: 'Accounting & Fees' } },
  { key: 'sms', label: { bn: 'এসএমএস', en: 'SMS' } },
  { key: 'notices', label: { bn: 'প্রকাশনা', en: 'Publishing' } },
  { key: 'feedback', label: { bn: 'মতামত', en: 'Feedback' } },
  { key: 'institute', label: { bn: 'প্রতিষ্ঠান সেটআপ', en: 'Institute Setup' } },
] as const

export type ScreenKey = (typeof GRANTABLE_SCREENS)[number]['key'] | 'staff'

const GRANTABLE_KEYS: ReadonlySet<string> = new Set(GRANTABLE_SCREENS.map((s) => s.key))
// Owner-only screens: never grantable to Staff Users.
const OWNER_ONLY: ReadonlySet<string> = new Set(['staff'])

export function screenKeyForPath(pathname: string): ScreenKey | null {
  const match = pathname.match(/^\/school\/([^/]+)/)
  if (!match) return null
  const segment = match[1]
  if (GRANTABLE_KEYS.has(segment) || OWNER_ONLY.has(segment)) return segment as ScreenKey
  return null
}

export function canOpenScreen(role: Role, grantedKeys: readonly string[], screen: ScreenKey): boolean {
  if (role === 'school_owner') return true
  if (role !== 'staff_user') return false
  if (OWNER_ONLY.has(screen)) return false
  return grantedKeys.includes(screen)
}
