import { ComboboxField } from './combobox-field'
import type { FieldOptions } from './field'
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
  fullWidth,
}: {
  combos: ClassCatalogueOption[]
  value: string
  ariaLabel: string
  allLabel: string
} & FieldOptions) {
  return (
    <ComboboxField
      name="classSection"
      defaultValue={value}
      aria-label={ariaLabel}
      className={fullWidth ? 'w-full' : undefined}
      options={[
        { value: '', label: allLabel },
        ...combos.map((c) => ({ value: c.value, label: c.label })),
      ]}
    />
  )
}
