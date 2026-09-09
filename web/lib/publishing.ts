import type { Lang } from '@/lib/i18n'
import { classCatalogueLabel } from '@/lib/class-catalogue'

// Publishing (issue #37, PRD §5.8): notices, homework, lesson plans, daily
// lessons and exam-prep suggestions share one table (`publications`, kind
// discriminated) and one list/detail UI. Kept pure for unit testing.

export type PublicationKind = 'notice' | 'homework' | 'lesson_plan' | 'daily_lesson' | 'exam_prep'
export type Importance = 'normal' | 'important' | 'urgent'

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
  target_scope?: TargetScope
  target_class_name?: string | null
  target_section?: string | null
}

/** A publication row's own target columns, in the shape a `publications`
 *  query returns, as far as the "Target Audience" label needs them. */
export interface TargetDisplayRow {
  /** The sole targeting discriminator (map #598 Wave 7/#608). */
  target_scope: TargetScope
  target_class_name: string | null
  target_academic_year?: number | null
  target_shift?: string | null
  target_group_department?: string | null
  target_section: string | null
}

/** The "Target Audience" label for the notices list/detail (issue #100),
 *  covering all three of map #598's scopes:
 *   - `all`  -> "All Students".
 *   - `offering`  -> the picked Class Offering's Class Catalogue label; when
 *     the Offering was since deleted (`class_offering_id` nulled by ON DELETE
 *     SET NULL, #599) the caller passes `offering = null` and we say so.
 *   - `broadcast` -> Class name plus every non-Any dimension, ' / '-joined
 *     (the Year is implicit -- always the active Academic Year pinned at
 *     compose time, #599 -- so it is not spelled out). */
export function targetAudienceLabel(
  row: TargetDisplayRow,
  lang: Lang,
  offering?: { name: string; section: string | null; group_department?: string | null; shift?: string | null } | null,
): string {
  const allStudents = lang === 'bn' ? 'সকল শিক্ষার্থী' : 'All Students'
  if (row.target_scope === 'all') return allStudents
  if (row.target_scope === 'offering') {
    if (offering) return classCatalogueLabel(offering)
    return lang === 'bn' ? 'অপসারিত ক্লাস অফারিং' : 'Removed class offering'
  }
  return [row.target_class_name, row.target_shift, row.target_group_department, row.target_section]
    .filter(Boolean)
    .join(' / ')
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

/** The compose form's raw target fields, before they become a stored row.
 *  Empty string = "not chosen" (offering id / class name) or "Any" (a
 *  broadcast predicate dimension). */
export interface TargetSelectionInput {
  scope: TargetScope
  /** scope === 'offering': the picked Class Offering id. */
  classOfferingId: string
  /** scope === 'broadcast': the Class name (`class_offerings.name` text). */
  className: string
  /** scope === 'broadcast': the School's active Academic Year, pinned at
   *  compose time (#599). null = no active year set -> a broadcast can't be
   *  composed yet. */
  academicYear: number | null
  /** scope === 'broadcast': '' = Any. */
  shift: string
  /** scope === 'broadcast': '' = Any. */
  groupDepartment: string
  /** scope === 'broadcast': '' = Any. */
  section: string
}

/** A stable machine code rather than an English sentence, so the caller
 *  renders it through `t()` in the viewer's language -- the form (client) and
 *  createPublication (server) both localise it. */
export type TargetSelectionError = 'offering-required' | 'class-required' | 'active-year-required'

/** The i18n key each validation code maps to. Lives here (pure, no i18n
 *  import) so both the client form and the server action look it up the same
 *  way. */
export const TARGET_SELECTION_ERROR_KEY = {
  'offering-required': 'notices.targetErrOffering',
  'class-required': 'notices.targetErrClass',
  'active-year-required': 'notices.targetErrActiveYear',
} as const satisfies Record<TargetSelectionError, string>

/** Three-scope compose validation (issue #607, map #598 Wave 6), mirroring
 *  migration 0195's per-scope CHECK invariants at the application layer -- the
 *  belt-and-suspenders pattern this codebase applies everywhere the DB has a
 *  CHECK. Returns a `TargetSelectionError` code, or null when well-formed.
 *   - `all`: always valid, no fields required.
 *   - `offering`: a Class Offering must be picked.
 *   - `broadcast`: a Class must be picked AND the School must have an active
 *     Academic Year to pin the target to (Shift/Group Department/Section stay
 *     optional -- blank means Any). */
export function validateTargetSelection(input: TargetSelectionInput): TargetSelectionError | null {
  if (input.scope === 'all') return null
  if (input.scope === 'offering') {
    return input.classOfferingId ? null : 'offering-required'
  }
  if (!input.className) return 'class-required'
  if (input.academicYear === null) return 'active-year-required'
  return null
}

// Offering-aware targeting (issue #595, map #598) -- the shared resolution
// primitive every consumer calls instead of re-implementing its own
// class_name/section text match (map #598's central lesson from #593). As of
// Wave 7 (#608) every consumer is on it: the Student RLS SELECT policy +
// student_material via student_matches_target (SQL), task_completion_roster
// (SQL), homeworkTargetsOffering / My Classes (TS, via targetRowMatchesOffering
// below), and SMS recipient resolution (TS, lib/sms/recipients.ts). The
// transitional target_type/'specific' shape and the target_scope-is-null
// legacy fallback are both gone -- this predicate and its SQL mirror are the
// only place the match logic exists anywhere in the repo.
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

export function toCandidateOffering(row: OfferingRow): CandidateOffering {
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
 *  `publications` query returns. Adapts that row shape to the shared
 *  `targetMatchesOffering` predicate -- the one match rule every consumer
 *  calls (map #598). `target_scope` is NOT NULL as of Wave 7 (#608); the
 *  transitional target_type/legacy-text dispatch is gone. */
export interface PublicationTargetRow {
  target_scope: TargetScope
  class_offering_id: string | null
  target_class_name: string | null
  target_academic_year: number | null
  target_shift: string | null
  target_group_department: string | null
  target_section: string | null
}

export function targetRowMatchesOffering(row: PublicationTargetRow, offering: OfferingRow): boolean {
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
    toCandidateOffering(offering),
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
