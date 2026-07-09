// Students are recorded with free-text class_name/section (MVP shape); the
// class list joins on trimmed exact match to show a per-class head count.

type StudentRow = { class_name: string | null; section: string | null }

function key(name: string, section: string | null): string {
  return `${name.trim()}|${(section ?? '').trim()}`
}

export function studentCounts(students: readonly StudentRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const s of students) {
    if (!s.class_name?.trim()) continue
    const k = key(s.class_name, s.section)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

export function countFor(
  counts: Map<string, number>,
  name: string,
  section: string | null,
): number {
  return counts.get(key(name, section)) ?? 0
}
