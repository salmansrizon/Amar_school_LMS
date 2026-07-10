// Accounting I helpers (issue #34, PRD §5.6): Fee/Fine/Scholarship-Discount
// split arithmetic, the absent-fine amount arithmetic, and the fee-structure
// copy-between-class/year payload builder. Kept pure for unit testing.
//
// The working-days formula itself (Total − Off Days − Approved Leave −
// Present, with off-day/leave overlap handling) is NOT reimplemented here —
// it lives exactly once, in is_absent_working_day (0021, absence-SMS #12),
// and the absent_working_days_in_month RPC (0037) reuses that function
// day-by-day. A parallel TypeScript copy of that per-day rule would be dead
// weight (nothing calls it) and a second place the definition could drift;
// the RPC's behaviour is covered by tests/integration/fee-structures.test.ts.

/** Fee (prescribed) + Fine − Scholarship/Discount, floored at zero. */
export function totalPayable(feeAmount: number, fineAmount: number, adjustAmount: number): number {
  return Math.max(0, feeAmount + fineAmount - adjustAmount)
}

/** Shortfall between total payable and what was actually received. */
export function dueAmount(totalPayableAmount: number, receivedAmount: number): number {
  return Math.max(0, totalPayableAmount - receivedAmount)
}

/** Absent working days × the per-day fine rate; negative inputs clamp to zero. */
export function absentFineAmount(absentDays: number, ratePerDay: number): number {
  return Math.max(0, absentDays) * Math.max(0, ratePerDay)
}

// Fee structures (copy-between-class/year).

export interface FeeStructureCore {
  fee_type: 'monthly' | 'one_time_yearly'
  amount: number
  fine_per_absent_day: number
}

export interface FeeStructureCopyPayload extends FeeStructureCore {
  class_id: string
  academic_year: number
}

const MIN_YEAR = 2000
const MAX_YEAR = 2100

/** Builds the upsert payload for copying a Fee Structure to another Class/Year:
 *  carries fee_type/amount/fine rate as-is, retargets class_id + academic_year. */
export function buildFeeStructureCopy(
  source: FeeStructureCore,
  targetClassId: string,
  targetYear: number,
): FeeStructureCopyPayload {
  if (!targetClassId) throw new Error('target class is required')
  if (!Number.isInteger(targetYear) || targetYear < MIN_YEAR || targetYear > MAX_YEAR) {
    throw new Error('target year must be a valid year')
  }
  return {
    class_id: targetClassId,
    academic_year: targetYear,
    fee_type: source.fee_type,
    amount: source.amount,
    fine_per_absent_day: source.fine_per_absent_day,
  }
}
