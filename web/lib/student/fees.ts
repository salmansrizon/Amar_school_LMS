// The Student's own fee record (#453), kept pure.
//
// Bound by ADR 0015: a Student sees paid, fine and due, and never the
// adjustment. The adjustment is not merely unselected — `student_fee_record`
// (0147) does not carry the column at all — so nothing here can reveal it, and
// nothing here needs to know it exists.
//
// A "receipt" is impossible by design: fee_collection_records keeps ONE
// cumulative row per Student per month with no per-payment history (see Fee
// Collection Record in CONTEXT.md), so what a Student can be shown is a
// statement of where the month stands.

export interface FeeRecord {
  id: string
  month: number
  year: number
  pay_amount: number
  fine_amount: number
  due_amount: number
  payment_method: string | null
  updated_at: string
}

/** Newest month first — the one a family is currently arguing about. */
export function sortFees(records: FeeRecord[]): FeeRecord[] {
  return [...records].sort((a, b) => b.year - a.year || b.month - a.month)
}

export interface FeeTotals {
  paid: number
  fine: number
  due: number
}

export function totalFees(records: FeeRecord[]): FeeTotals {
  return records.reduce<FeeTotals>(
    (sum, r) => ({
      paid: sum.paid + Number(r.pay_amount ?? 0),
      fine: sum.fine + Number(r.fine_amount ?? 0),
      due: sum.due + Number(r.due_amount ?? 0),
    }),
    { paid: 0, fine: 0, due: 0 },
  )
}

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_BN = ['জানু','ফেব','মার্চ','এপ্রি','মে','জুন','জুলা','আগ','সেপ','অক্টো','নভে','ডিসে']

/** "Sep 2026". Month is 1-12 from the record, so a bad value degrades to the
 *  number rather than throwing on an out-of-range index. */
export function monthLabel(month: number, year: number, lang: 'bn' | 'en'): string {
  const names = lang === 'bn' ? MONTHS_BN : MONTHS_EN
  return `${names[month - 1] ?? month} ${year}`
}
