// Supabase embeds a to-one relation as an object, but the generated typings
// widen it to an array. This normalizes either shape to the single related row
// (or null), so callers reading an embedded relation don't each re-implement
// the `Array.isArray(rel) ? rel[0] : rel` unwrap.
export function firstRelation<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}
