// Pure SMS-package input parsing (#296). Segments is a positive integer count;
// price/rate use takaToPoisha (lib/money).
export function parseSegments(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}
