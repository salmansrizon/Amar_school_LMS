import type { Lang } from '@/lib/i18n'

// Publishing (issue #37, PRD §5.8): notices, homework, lesson plans, daily
// lessons and exam-prep suggestions share one table (`publications`, kind
// discriminated) and one list/detail UI. Kept pure for unit testing.

export type PublicationKind = 'notice' | 'homework' | 'lesson_plan' | 'daily_lesson' | 'exam_prep'
export type Importance = 'normal' | 'important' | 'urgent'
export type TargetType = 'all' | 'specific'

export const PUBLICATION_KINDS: { key: PublicationKind; label: { bn: string; en: string } }[] = [
  { key: 'notice', label: { bn: 'নোটিশ', en: 'Notice' } },
  { key: 'homework', label: { bn: 'বাড়ির কাজ', en: 'Homework' } },
  { key: 'lesson_plan', label: { bn: 'পাঠ পরিকল্পনা', en: 'Lesson Plan' } },
  { key: 'daily_lesson', label: { bn: 'দৈনিক পাঠ', en: 'Daily Lesson' } },
  { key: 'exam_prep', label: { bn: 'পরীক্ষার প্রস্তুতি', en: 'Exam Prep' } },
]

export const IMPORTANCE_LEVELS: { key: Importance; label: { bn: string; en: string } }[] = [
  { key: 'normal', label: { bn: 'সাধারণ', en: 'Normal' } },
  { key: 'important', label: { bn: 'গুরুত্বপূর্ণ', en: 'Important' } },
  { key: 'urgent', label: { bn: 'জরুরি', en: 'Urgent' } },
]

export function kindLabel(kind: PublicationKind, lang: Lang): string {
  return PUBLICATION_KINDS.find((k) => k.key === kind)?.label[lang] ?? kind
}

export function importanceLabel(importance: Importance, lang: Lang): string {
  return IMPORTANCE_LEVELS.find((i) => i.key === importance)?.label[lang] ?? importance
}

/** Badge tones per notices-list.html: urgent=danger, important=warning, normal=neutral. */
export function importanceBadgeClass(importance: Importance): string {
  if (importance === 'urgent') return 'bg-alert-soft text-alert-deep'
  if (importance === 'important') return 'bg-sun-soft text-sun-deep'
  return 'bg-paper-muted text-muted'
}

/** Badge tone per notices-list.html: only the Notice type gets the info tone. */
export function kindBadgeClass(kind: PublicationKind): string {
  if (kind === 'notice') return 'bg-sky-soft text-sky-deep'
  return 'bg-paper-muted text-muted'
}

export interface PublicationRow {
  id: string
  kind: PublicationKind
  title: string
  importance: Importance
  target_type?: TargetType
  target_class_name?: string | null
  target_section?: string | null
}

/** "All Students" for an all-target row, else "Class 6 / A / Morning" (missing parts dropped). */
export function targetAudienceLabel(
  row: { target_type: TargetType; target_class_name: string | null; target_section: string | null },
  shiftName: string | null,
  lang: Lang,
): string {
  if (row.target_type === 'all') return lang === 'bn' ? 'সকল শিক্ষার্থী' : 'All Students'
  return [row.target_class_name, row.target_section, shiftName].filter(Boolean).join(' / ')
}

/** List search (title, case-insensitive) + optional kind filter, for the List tab. */
export function filterPublications<T extends PublicationRow>(
  rows: T[],
  query: string,
  kind: PublicationKind | '',
): T[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => (!q || r.title.toLowerCase().includes(q)) && (!kind || r.kind === kind))
}

/** A "specific" target needs at least one of class/shift/section chosen. */
export function validateTargetSelection(
  targetType: TargetType,
  className: string,
  shiftId: string,
  section: string,
): string | null {
  if (targetType === 'all') return null
  if (!className && !shiftId && !section) return 'Choose at least one target filter'
  return null
}

// Gallery albums (PRD §5.8 + §7): per-album configurable image-count and
// per-image size caps, enforced server-side (a DB trigger — see migration
// 0037), not just here. These helpers are UI-facing display/pre-check only.

/** "12/20" for the album grid + detail toolbar badge. */
export function albumCountLabel(count: number, max: number): string {
  return `${count}/${max}`
}

export function albumIsFull(count: number, max: number): boolean {
  return count >= max
}

export function photoExceedsCap(fileSizeBytes: number, maxBytes: number): boolean {
  return fileSizeBytes > maxBytes
}

// Client-side pre-check mirroring the 'publications' Storage bucket's
// server-enforced cap (migration 0037) — a single optional image, no album
// cap concept.
export const PUBLICATION_MAX_IMAGE_BYTES = 2 * 1024 * 1024

const PHOTO_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Storage extension for an allowed gallery/publication image MIME type; null = not allowed. */
export function galleryImageExtension(mimeType: string): string | null {
  return PHOTO_MIME_EXT[mimeType] ?? null
}
