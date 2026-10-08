// Neutral name helpers shared by both shells (map #171, T1). Lives outside any
// domain namespace so /school and /super-admin can both use it without one area
// depending on the other.

/** First letter of the first two words, uppercased; 'A' when there is nothing. */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'A'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** Longest student/employee name the forms accept. The column is unbounded
 *  text, so this is only a UI guard against one absurd value wrecking a profile
 *  header or printed card. */
export const PERSON_NAME_MAX = 100
