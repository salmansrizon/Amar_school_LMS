// Pure coupon-value parsing (#291). Percent is stored as an integer 1..100; flat
// is stored as poisha (taka × 100), matching the discounts.value column (0087).
// Returns null on invalid input so the server action can surface a clean error.
export function parseCouponValue(discountType: 'percent' | 'flat', raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (discountType === 'percent') {
    if (!Number.isInteger(n) || n < 1 || n > 100) return null
    return n
  }
  // flat: taka → poisha
  if (n <= 0) return null
  return Math.round(n * 100)
}
