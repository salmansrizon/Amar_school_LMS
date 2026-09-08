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
// #603) and task_completion_roster (Wave 3, #604) both delegate to this
// (via the shared publication_target_matches_offering_any dispatcher, which
// itself was added specifically so this second consumer didn't hand-copy
// the dispatch logic). SMS (Wave 5, #606) does not yet -- until that wave
// lands, it still runs its pre-existing independent logic. Keep this list
// current as each wave lands: do not describe adoption as more complete
// than it actually is in the tree, and do not let it silently fall out of
// date either -- #607 (Wave 6, the compose UI that would actually let a
// School write an 'offering'-scoped row) is blocked by BOTH #604 and #605
// in the map's dependency graph specifically to prevent landing before
// every read-side consumer understands the new scope.
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
  if (target.scope === 'offering') {
    // Explicit non-null guard, kept structurally symmetric with the SQL
    // mirror (publication_target_matches_offering, 0195) even though
    // CandidateOffering.id is typed non-nullable today: the SQL side needed
    // this exact guard because its own candidate id (a LEFT JOINed
    // class_offerings.id) genuinely can be null at runtime, a real bug
    // caught by code review (map #598 Wave 3/#604). TypeScript's type
    // system prevents the equivalent from happening here today, but a
    // future caller passing untyped/JSON data could still defeat that --
    // this line costs nothing and keeps the two implementations reading
    // the same way for anyone comparing them.
    return offering.id != null && target.classOfferingId === offering.id
  }
  return (
    target.className === offering.name &&
    target.academicYear === offering.academicYear &&
    (target.shift === null || target.shift === offering.shift) &&
    (target.groupDepartment === null || target.groupDepartment === offering.groupDepartment) &&
    (target.section === null || target.section === offering.section)
  )
}

// The pre-#595 (name, section)-text targeting rule (map #598 Wave 4/#605) --
// the TS mirror of the SQL publication_target_matches_offering_legacy
// (0196), for a `target_scope IS NULL` (not-yet-migrated) row. Kept as its
// own function rather than inlined, for the identical reason the SQL side
// extracted it: every transitional-window TS consumer shares this one copy,
// not a hand-copy each.
export interface LegacyPublicationTarget {
  targetType: string
  targetClassName: string | null
  targetSection: string | null
}

export function targetMatchesOfferingLegacy(
  target: LegacyPublicationTarget,
  offering: { name: string; section: string | null },
): boolean {
  if (target.targetType === 'all') return true
  return (
    (target.targetClassName === null || target.targetClassName === offering.name) &&
    (target.targetSection === null || target.targetSection === (offering.section ?? ''))
  )
}

/** A Class Offering's own identifying fields, in the exact snake_case shape
 *  a real `class_offerings` query returns -- the boundary type real callers
 *  (My Classes, #605) actually have on hand, as opposed to CandidateOffering
 *  (the pure predicate's own camelCase shape, matched against the shared
 *  parity scenario table since Wave 1/#602). */
export interface OfferingRow {
  id: string
  name: string
  academic_year: number | null
  shift: string | null
  group_department: string | null
  section: string | null
}

function toCandidateOffering(row: OfferingRow): CandidateOffering {
  return {
    id: row.id,
    name: row.name,
    academicYear: row.academic_year,
    shift: row.shift,
    groupDepartment: row.group_department,
    section: row.section,
  }
}

/** A publication's own target columns, in the exact snake_case shape a real
 *  `publications` query returns. The TS mirror of the SQL dispatch
 *  publication_target_matches_offering_any (0196): delegates to the shared
 *  predicate when target_scope is populated, falls back to the legacy rule
 *  when it is still null -- one dispatch, shared by every TS consumer
 *  (homeworkTargetsOffering today; SMS, Wave 5/#606, next), not a hand-copy
 *  each. Retired in Wave 7 (#608) once every row has target_scope. */
export interface PublicationTargetRow {
  target_scope: TargetScope | null
  target_type: string
  class_offering_id: string | null
  target_class_name: string | null
  target_academic_year: number | null
  target_shift: string | null
  target_group_department: string | null
  target_section: string | null
}

export function targetRowMatchesOffering(row: PublicationTargetRow, offering: OfferingRow): boolean {
  const candidate = toCandidateOffering(offering)
  if (row.target_scope !== null) {
    return targetMatchesOffering(
      {
        scope: row.target_scope,
        classOfferingId: row.class_offering_id,
        className: row.target_class_name,
        academicYear: row.target_academic_year,
        shift: row.target_shift,
        groupDepartment: row.target_group_department,
        section: row.target_section,
      },
      candidate,
    )
  }
  return targetMatchesOfferingLegacy(
    { targetType: row.target_type, targetClassName: row.target_class_name, targetSection: row.target_section },
    candidate,
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
