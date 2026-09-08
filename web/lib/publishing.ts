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

/** "All Students" for an all-target row, else "Class 6 / A" (missing parts
 *  dropped). OfficeTime left publication targeting with issue #100. */
export function targetAudienceLabel(
  row: { target_type: TargetType; target_class_name: string | null; target_section: string | null },
  lang: Lang,
): string {
  if (row.target_type === 'all') return lang === 'bn' ? 'সকল শিক্ষার্থী' : 'All Students'
  return [row.target_class_name, row.target_section].filter(Boolean).join(' / ')
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

/** A "specific" target needs at least one of class/section chosen. */
export function validateTargetSelection(
  targetType: TargetType,
  className: string,
  section: string,
): string | null {
  if (targetType === 'all') return null
  if (!className && !section) return 'Choose at least one target filter'
  return null
}

// Offering-aware targeting (issue #595, map #598) -- the shared resolution
// primitive every consumer is MEANT to call instead of each re-implementing
// its own class_name/section text match (map #598's central lesson from
// #593). Adoption so far: Student RLS via student_matches_target (Wave 2,
// #603) delegates to this. task_completion_roster (Wave 3, #604) and SMS
// (Wave 5, #606) do not yet -- until their own waves land, they still run
// their pre-existing independent logic. Caught by code review: do not
// describe this as already-universal adoption in future edits here: an
// 'offering'-scoped publication is a live, insertable state as of Wave 1
// (#602), and task_completion_roster's own untouched inline predicate
// resolves an empty target_class_name/target_section (exactly what an
// 'offering'-scoped row has, per #602's CHECK) as "matches every student" --
// a real roster-visibility bug for any homework using the new scope before
// #604 lands, not just stale documentation. #607 (Wave 6, the compose UI
// that would actually let a School create such a row) is blocked by #604 in
// the map's dependency graph specifically to prevent this landing out of
// order.
//
// This TS function and its SQL mirror (publication_target_matches_offering,
// migration 0195) must stay in lockstep -- see
// tests/unit/publishing-targeting.test.ts and
// tests/integration/publishing-targeting.test.ts, which both assert against
// the same PUBLICATION_TARGET_SCENARIOS table (lib/publishing-targeting-scenarios.ts).
//
// A `null` predicate field (shift/groupDepartment/section) means "Any" --
// this table's own existing, already-documented convention for
// target_class_name/target_section, extended rather than replaced (#600's
// resolution). Academic Year is never "Any" for a broadcast target -- it is
// always a specific pinned value (#599's resolution: a target never spans
// Academic Years).
export type TargetScope = 'all' | 'offering' | 'broadcast'

export interface PublicationTarget {
  scope: TargetScope
  /** Set only when scope === 'offering'. */
  classOfferingId: string | null
  /** Set only when scope === 'broadcast'. The Class identity is text --
   *  `class_offerings.name` -- there is no stable Class-definition id in
   *  this schema (#600's resolution, investigated not assumed). */
  className: string | null
  /** Set only when scope === 'broadcast'. Never null for a broadcast target. */
  academicYear: number | null
  /** null = Any. Only meaningful when scope === 'broadcast'. */
  shift: string | null
  /** null = Any. Only meaningful when scope === 'broadcast'. */
  groupDepartment: string | null
  /** null = Any. Only meaningful when scope === 'broadcast'. */
  section: string | null
}

/** The candidate Class Offering's own fields -- never the target's. Kept
 *  separate from PublicationTarget so a caller can't accidentally compare a
 *  target against itself. */
export interface CandidateOffering {
  id: string
  name: string
  academicYear: number | null
  shift: string | null
  groupDepartment: string | null
  section: string | null
}

/** Whether `target` reaches `offering` -- live, not a frozen snapshot: call
 *  this fresh every time recipients are resolved, never cache the result
 *  (#599's resolution). For 'offering' scope, only the id is compared -- the
 *  Offering's own current name/year/shift/group are irrelevant once an exact
 *  pick was made. For 'broadcast', every non-null predicate field must match
 *  exactly; a null field always matches (Any). */
export function targetMatchesOffering(target: PublicationTarget, offering: CandidateOffering): boolean {
  if (target.scope === 'all') return true
  if (target.scope === 'offering') return target.classOfferingId === offering.id
  return (
    target.className === offering.name &&
    target.academicYear === offering.academicYear &&
    (target.shift === null || target.shift === offering.shift) &&
    (target.groupDepartment === null || target.groupDepartment === offering.groupDepartment) &&
    (target.section === null || target.section === offering.section)
  )
}

// Gallery albums (PRD §5.8 + §7): per-album configurable image-count and
// per-image size caps, enforced server-side (a DB trigger — see migration
// 0041), not just here. These helpers are UI-facing display/pre-check only.

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
// server-enforced cap (migration 0041) — a single optional image, no album
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
