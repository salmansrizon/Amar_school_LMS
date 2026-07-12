// Exams IV (issue #33, PRD §5.5): pure shaping helpers for the co-curricular
// checklist (cocurricular_items / cocurricular_checklist_marks, migration
// 0052) — kept DB-free so the merge logic gets its own unit-test pass,
// mirroring the grading.ts / exam-setup.ts split used elsewhere in Exams.

export interface CocurricularItem {
  id: string
  label: string
  sort_order: number
}

export interface ChecklistItemRow {
  id: string
  label: string
  checked: boolean
}

/** Merges a school's configured item list with one student's checked-item
 * ids into the progress report's checklist rows (mockup: a checkmark badge
 * per checked item, a dash for unchecked) — items are already sorted by the
 * caller's query (sort_order), this just folds in the checked flag. */
export function buildChecklistRows(
  items: CocurricularItem[],
  checkedItemIds: ReadonlySet<string>,
): ChecklistItemRow[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    checked: checkedItemIds.has(item.id),
  }))
}

/** Sorts items for display/entry (sort_order, then label as a tiebreaker) —
 * shared by the settings screen and the per-exam entry grid so both list
 * items in the same order. */
export function sortCocurricularItems<T extends CocurricularItem>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
}
