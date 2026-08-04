// Money formatting shared across every surface (school, super-admin, distributor).
// All monetary amounts are stored as poisha (integer minor units).

/** Format poisha as a Bangladeshi Taka string. Pure. */
export function formatTaka(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
