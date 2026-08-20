// Shared Class + Section combo-select primitive (docs/011_student_module.md,
// map #398): Attendance (lib/attendance-manual.ts) and Students List
// (lib/students.ts) both derive their class/section filters from the same
// roster shape but keep two separate selects today. This collapses that
// into one dropdown's worth of options without touching either module's
// filtering functions — callers decode the selected value back into the
// same className/section pair filterRoster/filterStudents already take.

// Unit Separator: opaque join between className and section. Never
// displayed, and unlike "-" or "/" it cannot collide with a school's own
// section naming (section already legitimately contains "-", e.g.
// "Morning - A" — see migration 0060_remove_student_shift.sql).
const KEY_SEP = ''

export interface ClassSectionOption {
  value: string
  className: string
  section: string
  label: string
}

export function classSectionKey(className: string, section: string): string {
  return `${className}${KEY_SEP}${section}`
}

export function parseClassSectionKey(key: string): { className: string; section: string } {
  const idx = key.indexOf(KEY_SEP)
  if (idx === -1) return { className: key, section: '' }
  return { className: key.slice(0, idx), section: key.slice(idx + 1) }
}

/**
 * Deduped, sorted class+section combinations actually present in `rows`
 * (not every class in the catalogue — only ones with data), one option per
 * combination. Label matches the `{class} - {section}` convention already
 * used by the Exams/Fees class dropdowns.
 */
export function classSectionOptions<T extends { class_name: string | null; section: string | null }>(
  rows: T[],
): ClassSectionOption[] {
  const seen = new Map<string, ClassSectionOption>()
  for (const row of rows) {
    if (!row.class_name) continue
    const className = row.class_name
    const section = row.section ?? ''
    const value = classSectionKey(className, section)
    if (!seen.has(value)) {
      seen.set(value, { value, className, section, label: className + (section ? ` - ${section}` : '') })
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.className.localeCompare(b.className) || a.section.localeCompare(b.section),
  )
}
