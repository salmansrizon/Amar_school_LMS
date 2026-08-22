// Shared Class Catalogue primitive (map #421): every screen that lets an
// admin pick a Class reads the same `classes` table shape ({id, name,
// section}) and needs the same value/label convention. This is the
// catalogue-sourced counterpart to class-section-options.ts's roster-derived
// combos — a Class appears here the moment it's created, whether or not any
// Student is enrolled in it yet. Unlike that module, the option value is the
// row's own id, so there's no need for a composite-key encoding: Class
// Resolution just looks the id back up in the same options list.

export interface ClassCatalogueRow {
  id: string
  name: string
  section: string | null
}

export interface ClassCatalogueOption {
  value: string
  className: string
  section: string
  label: string
}

/**
 * One option per Class Catalogue row (including classes with zero enrolled
 * students), value = classes.id, label matching the `{class} - {section}`
 * convention already used across the app. Sorted by class name then section.
 */
export function classCatalogueOptions(rows: ClassCatalogueRow[]): ClassCatalogueOption[] {
  return rows
    .map((row) => {
      const section = row.section ?? ''
      return {
        value: row.id,
        className: row.name,
        section,
        label: row.name + (section ? ` - ${section}` : ''),
      }
    })
    .sort((a, b) => a.className.localeCompare(b.className) || a.section.localeCompare(b.section))
}

/**
 * Resolves a picked Class Catalogue id back into the exact `{className,
 * section}` text pair that filterRoster/filterStudents and their downstream
 * links already expect. An empty or unmatched id resolves to the "All"
 * pair (empty strings), the same fallback shape parseClassSectionKey('') used.
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
