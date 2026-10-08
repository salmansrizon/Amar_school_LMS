import { ComboboxField } from './combobox-field'
import type { FieldOptions } from './field'
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
  submitOnChange,
  fullWidth,
}: {
  combos: ClassCatalogueOption[]
  value: string
  ariaLabel: string
  allLabel: string
  name?: string
  /** Apply the pick immediately — see ComboboxField. */
  submitOnChange?: boolean
} & FieldOptions) {
  return (
    <ComboboxField
      name={name}
      defaultValue={value}
      submitOnChange={submitOnChange}
      aria-label={ariaLabel}
      className={fullWidth ? 'w-full' : undefined}
      options={[
        { value: '', label: allLabel },
        ...combos.map((c) => ({ value: c.value, label: c.label })),
      ]}
    />
  )
}
