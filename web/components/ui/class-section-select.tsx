import { selectClass, type FieldOptions } from './field'
import type { ClassCatalogueOption } from '@/lib/class-catalogue'

// The one `<select name="classSection">` rendering shared by Mark Attendance,
// Attendance Book, Student Log finder, and Students List (map #398) — each
// page still owns its own label/wrapper markup and translated strings, this
// only collapses the identical option-list rendering underneath.
export function ClassSectionSelect({
  combos,
  value,
  ariaLabel,
  allLabel,
  size,
  fullWidth,
}: {
  combos: ClassCatalogueOption[]
  value: string
  ariaLabel: string
  allLabel: string
} & FieldOptions) {
  return (
    <select name="classSection" defaultValue={value} aria-label={ariaLabel} className={selectClass({ size, fullWidth })}>
      <option value="">{allLabel}</option>
      {combos.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  )
}
