/** The path a refused reader was trying to reach, or null.
 *
 *  #538 asks the permission-denied screen to preserve the intended destination
 *  so the reader can tell the Owner which screen they need. That value arrives
 *  in a query parameter, which means it arrives from the outside.
 *
 *  It is only ever rendered as text today — never linked, never redirected to —
 *  but it is validated anyway, because the next person to add a "take me there"
 *  button will reach for this function and inherit the guard rather than write
 *  one. Anything that is not a plain in-app path is dropped: `//evil.example`
 *  and `/\\evil.example` are protocol-relative URLs in a browser, a scheme is
 *  never a path, and control characters have no business in one.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value.startsWith('/')) return null
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  return value
}
