// Study material for a Student (#447), kept pure.
//
// Two sources land on one surface: the class syllabus PDF and the lesson
// plans / daily lessons / exam prep posted as publications. `student_material`
// (0141) already unions them, so the only decisions left are how to group the
// list and what to call each kind.

export interface StudentMaterial {
  id: string
  source: 'publication' | 'syllabus'
  kind: string
  title: string
  content: string | null
  storage_path: string | null
  file_name: string | null
  link_url: string | null
  posted_at: string
  posted_by: string | null
}

/** File type from the name, for the "what is this before I open it" line.
 *  Nothing in the schema records a MIME type or a size, so the extension is
 *  the honest answer and size is simply not shown. */
export function fileKind(material: StudentMaterial): string | null {
  const name = material.file_name ?? material.storage_path
  if (!name) return null
  const ext = name.split('.').pop()
  return ext && ext !== name ? ext.toUpperCase() : null
}

/** Only a stored object can be downloaded; a lesson plan may be text, or a
 *  link, and has nothing to sign a URL for. */
export function isDownloadable(material: StudentMaterial): boolean {
  return Boolean(material.storage_path)
}

export interface MaterialGroup {
  key: string
  items: StudentMaterial[]
}

/**
 * Grouped for finding things.
 *
 * The syllabus comes first — it is the one document a student is sent looking
 * for by name. Everything else groups by kind and falls back to recency inside
 * each group. The ticket asked for grouping by subject, but neither source
 * records one: `class_syllabi` has no subject column and `publications` has no
 * subject_id, so grouping by subject would mean inventing an association that
 * is not in the data.
 */
export function groupMaterials(materials: StudentMaterial[]): MaterialGroup[] {
  const byKind = new Map<string, StudentMaterial[]>()
  for (const m of materials) {
    const list = byKind.get(m.kind) ?? []
    list.push(m)
    byKind.set(m.kind, list)
  }

  const order = ['syllabus', 'lesson_plan', 'daily_lesson', 'exam_prep']
  return [...byKind.entries()]
    .sort(([a], [b]) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b)
    })
    .map(([key, items]) => ({
      key,
      items: items.sort((x, y) => y.posted_at.localeCompare(x.posted_at)),
    }))
}
