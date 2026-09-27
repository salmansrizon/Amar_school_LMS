import { selectClass, type FieldOptions } from './field'
import type { ClassCatalogueOption } from '@/lib/class-catalogue'

// The one `<select name="classSection">` rendering shared by Mark Attendance,
// Attendance Book, Student Log finder, and Students List (map #398) — each
// page still owns its own label/wrapper markup and translated strings, this
// only collapses the identical option-list rendering underneath.
//
// `name` defaults to "classSection" (every existing caller relies on this)
// but is overridable (map #668) for a page needing a second, independent
// class filter alongside the page's main one — e.g. Student Leave
// Management's roster-browser filter, kept separate from its leave-records
// filter so submitting one doesn't reset the other's query params.
export function ClassSectionSelect({
  combos,
  value,
  ariaLabel,
  allLabel,
  name = 'classSection',
  size,
  fullWidth,
}: {
  combos: ClassCatalogueOption[]
  value: string
  ariaLabel: string
  allLabel: string
  name?: string
} & FieldOptions) {
  return (
    <select name={name} defaultValue={value} aria-label={ariaLabel} className={selectClass({ size, fullWidth })}>
      <option value="">{allLabel}</option>
      {combos.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  )
}
