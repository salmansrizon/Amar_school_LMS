// Which super-admin nav entry is active (map #171, T1). Extracted so this bit of
// routing logic is unit-testable without rendering the client shell. The generic
// avatar-initials helper lives in lib/name.ts — it is not super-admin-specific.

/** The dashboard root highlights only on an exact match; every other section
 *  highlights when the current path falls under it (child routes stay lit). */
export function isNavActive(pathname: string, href: string): boolean {
  return href === '/super-admin' ? pathname === '/super-admin' : pathname.startsWith(href)
}
