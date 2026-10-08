/** One CSV cell: quoted, quotes doubled, and a formula lead-in neutralised so a
 *  spreadsheet never runs a name or phone number as a formula. Leading
 *  whitespace is skipped before the check (LibreOffice evaluates " =…") and the
 *  full-width ＝＋－＠ forms count too. */
export function csvCell(value: string | number | null | undefined): string {
  let v = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r＝＋－＠]/.test(v.trimStart())) v = `'${v}`
  return `"${v.replace(/"/g, '""')}"`
}
