/** Print routes (ADR 0007): any path with a `/print` segment, with or without
 *  a trailing sub-path. Shared by the CSP (which lets the app frame them) and
 *  the print preview popup (which only prints a real print route). */
export function isPrintPath(pathname: string): boolean {
  return /\/print(\/|$)/.test(pathname)
}
