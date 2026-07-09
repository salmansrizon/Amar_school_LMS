import type { Lang } from '@/lib/i18n'

// Bangladesh working week is Sun–Thu; the schema still allows 0–6 so a School
// that works Saturday isn't blocked — this is only the grid we render/print.
export const ROUTINE_DAYS = [0, 1, 2, 3, 4] as const
export const ROUTINE_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const

const DAY_LABELS: Record<number, { bn: string; en: string }> = {
  0: { bn: 'রবি', en: 'Sun' },
  1: { bn: 'সোম', en: 'Mon' },
  2: { bn: 'মঙ্গল', en: 'Tue' },
  3: { bn: 'বুধ', en: 'Wed' },
  4: { bn: 'বৃহঃ', en: 'Thu' },
  5: { bn: 'শুক্র', en: 'Fri' },
  6: { bn: 'শনি', en: 'Sat' },
}

export function dayLabel(day: number, lang: Lang): string {
  return DAY_LABELS[day]?.[lang] ?? String(day)
}

export interface RoutineSlot {
  day_of_week: number
  period: number
  subject_id: string | null
  teacher_id: string | null
  room_id: string | null
}

/** Index slots by `${day}:${period}` for O(1) cell lookup. */
export function indexSlots(slots: RoutineSlot[]): Map<string, RoutineSlot> {
  const map = new Map<string, RoutineSlot>()
  for (const s of slots) map.set(`${s.day_of_week}:${s.period}`, s)
  return map
}
