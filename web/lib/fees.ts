// Accounting I helpers (issue #34, PRD §5.6): Fee/Fine/Scholarship-Discount
// split arithmetic, the absent-fine calculator's working-days formula (shared
// definition with the absence-SMS feature's is_absent_working_day, 0021/#12),
// and the fee-structure copy-between-class/year payload builder. Kept pure
// for unit testing; the live-data versions (real off days/leaves/attendance,
// real school-tenancy checks) live in the absent_working_days_in_month RPC
// (0037) which walks the same per-day rule via is_absent_working_day.

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

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Every ISO (YYYY-MM-DD) date in the given calendar month, in order. */
export function daysInMonth(year: number, month: number): string[] {
  const count = new Date(year, month, 0).getDate()
  const out: string[] = []
  for (let d = 1; d <= count; d++) {
    out.push(`${year}-${pad2(month)}-${pad2(d)}`)
  }
  return out
}

export interface LeaveRange {
  from_day: string
  to_day: string
}

/** A single day's absent-working-day test — mirrors is_absent_working_day
 *  (0021): not an off day, not covered by approved leave, not present. */
export function isAbsentWorkingDay(
  day: string,
  offDays: ReadonlySet<string>,
  leaves: readonly LeaveRange[],
  presentDays: ReadonlySet<string>,
): boolean {
  if (offDays.has(day)) return false
  if (leaves.some((l) => day >= l.from_day && day <= l.to_day)) return false
  if (presentDays.has(day)) return false
  return true
}

/** The absent-fine working-days formula: Total − Off Days − Approved Leave −
 *  Present, evaluated per day so off-day/leave overlap never double-subtracts. */
export function countAbsentWorkingDays(
  days: readonly string[],
  offDays: readonly string[],
  leaves: readonly LeaveRange[],
  presentDays: readonly string[],
): number {
  const offSet = new Set(offDays)
  const presentSet = new Set(presentDays)
  return days.filter((d) => isAbsentWorkingDay(d, offSet, leaves, presentSet)).length
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
