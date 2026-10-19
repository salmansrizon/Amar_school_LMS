'use client'

import { Children, cloneElement, isValidElement, useId } from 'react'

const labelClass = 'mb-1 block text-xs font-semibold text-muted'
const NATIVE_CONTROLS = ['input', 'select', 'textarea']

/** A visible label tied to its control. Pass `htmlFor` for a control that
 *  brings its own id (ComboboxField / SelectField). Otherwise the first native
 *  input / select / textarea among the children gets a generated id, so the
 *  label really names it for screen readers and a click on the label focuses
 *  it. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  const auto = useId()
  let id = htmlFor
  const wired =
    id !== undefined
      ? children
      : Children.map(children, (child) => {
          if (id || !isValidElement<{ id?: string; type?: string }>(child)) return child
          if (!NATIVE_CONTROLS.includes(String(child.type)) || child.props.type === 'hidden') return child
          id = child.props.id ?? auto
          return cloneElement(child, { id })
        })
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      {wired}
    </div>
  )
}
