export type Params = Record<string, string | undefined>

/** Merge a patch into the current query and return `?…` (or `?` when empty).
 *  A null/empty value deletes the key. Changing a filter drops `page`, so a
 *  new filter never lands on a page that no longer exists; `page` and `view`
 *  (the open record drawer) keep it. */
export function withParams(params: Params, patch: Record<string, string | null>): string {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) next.set(k, v)
  for (const [k, v] of Object.entries(patch)) {
    if (v) next.set(k, v)
    else next.delete(k)
  }
  if (Object.keys(patch).some((k) => k !== 'page' && k !== 'view')) next.delete('page')
  return `?${next.toString()}`
}
