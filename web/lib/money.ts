// Money formatting shared across every surface (school, super-admin, distributor).
// All monetary amounts are stored as poisha (integer minor units).

/** Format poisha as a Bangladeshi Taka string. Pure. */
export function formatTaka(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Parse a positive taka input to integer poisha; null if invalid or ≤ 0. */
export function takaToPoisha(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}
