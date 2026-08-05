// Pure helper (#292): the {{placeholder}} names a template interpolates, deduped
// in first-seen order. Same {{\w+}} grammar the notification renderer uses, so
// the editor can show authors which variables a template expects.
export function extractPlaceholders(title: string, body: string): string[] {
  const seen: string[] = []
  for (const m of `${title} ${body}`.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!seen.includes(m[1])) seen.push(m[1])
  }
  return seen
}
