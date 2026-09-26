/** One CSV cell: quoted, quotes doubled, and a leading = + - @ neutralised so a
 *  spreadsheet never runs a name or phone number as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  let v = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return `"${v.replace(/"/g, '""')}"`
}
