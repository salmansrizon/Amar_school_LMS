// Shared Class Catalogue primitive (map #421): every screen that lets an
// admin pick a Class reads the same `class_offerings` table shape (renamed
// from `classes`, issue #571/#584 — {id, name, section}) and needs the same
// value/label convention. A Class Offering appears here the moment it's
// created, whether or not any Student is enrolled in it yet — this replaced
// an earlier roster-derived module (map #398) that only surfaced
// combinations with an actual enrolled Student. The option value is the
// row's own id — now a real class_offering_id (map #568/#582) — so there's
// no need for a composite-key encoding: Class Resolution just looks the id
// back up in the same options list.

export interface ClassCatalogueRow {
  id: string
  name: string
  section: string | null
  group_department?: string | null
}

export interface ClassCatalogueOption {
  value: string
  className: string
  section: string
  label: string
}

/**
 * The `{class} - {section} ({group})` label convention used everywhere a
 * Class Catalogue row is displayed — the one place this formatting lives.
 * The group suffix disambiguates rows that otherwise share the same class
 * name and section but differ by group/department (e.g. Science vs.
 * Humanities); it's omitted when the row has no group set.
 */
export function classCatalogueLabel(row: {
  name: string
  section: string | null
  group_department?: string | null
}): string {
  return (
    row.name +
    (row.section ? ` - ${row.section}` : '') +
    (row.group_department ? ` (${row.group_department})` : '')
  )
}

/**
 * One option per Class Catalogue row (including classes with zero enrolled
 * students), value = classes.id. Sorted by class name then section — screens
 * that must preserve their existing row order (e.g. Exams' creation-order
 * list) should use classCatalogueLabel directly instead of this.
 */
export function classCatalogueOptions(rows: ClassCatalogueRow[]): ClassCatalogueOption[] {
  return rows
    .map((row) => ({
      value: row.id,
      className: row.name,
      section: row.section ?? '',
      label: classCatalogueLabel(row),
    }))
    .sort((a, b) => a.className.localeCompare(b.className) || a.section.localeCompare(b.section))
}

/**
 * Resolves a picked Class Catalogue id back into the exact `{className,
 * section}` text pair that filterRoster/filterStudents and their downstream
 * links already expect. An empty or unmatched id resolves to the "All" pair
 * (empty strings) — the same behavior as an absent filter.
 */
export function resolveClassCatalogueSelection(
  options: ClassCatalogueOption[],
  id: string,
): { className: string; section: string } {
  if (!id) return { className: '', section: '' }
  const match = options.find((o) => o.value === id)
  return match ? { className: match.className, section: match.section } : { className: '', section: '' }
}

/**
 * Convenience wrapper for the four screens that need both a Class Catalogue
 * picker's options (to render) and the currently selected {className,
 * section} pair (to filter) from the same raw fetch — one call instead of
 * two, and one less place a caller could resolve against a different combos
 * array than the one it renders.
 */
export function resolveClassSection(
  rows: ClassCatalogueRow[],
  id: string,
): { combos: ClassCatalogueOption[]; className: string; section: string } {
  const combos = classCatalogueOptions(rows)
  return { combos, ...resolveClassCatalogueSelection(combos, id) }
}

/**
 * The inverse of resolveClassCatalogueSelection: finds the Class Catalogue
 * id for a given {className, section} pair, for a page that already holds
 * the decoded filter and needs to rebuild a picker's value from it (e.g. a
 * back-link to a page whose dropdown reads this id). Returns '' (the "All"
 * value) when className is empty or no matching row exists.
 */
export function findClassCatalogueId(
  options: ClassCatalogueOption[],
  className: string,
  section: string,
): string {
  if (!className) return ''
  const match = options.find((o) => o.className === className && o.section === section)
  return match?.value ?? ''
}
