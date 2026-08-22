// Distributor KPI aggregation for the super-admin profile dashboard (#415, map
// #409). Pure: totals over a distributor's already-fetched commission rows.
// Amounts stay in minor units — the UI formats with formatTaka. commissionTotal
// is every accrued+settled commission; pendingSettlement is the accrued slice
// not yet paid out in a settlement.
export interface DistributorKpis {
  commissionTotal: number
  pendingSettlement: number
}

export function distributorKpis(
  commissions: { commission_amount: number; status: string }[],
): DistributorKpis {
  let commissionTotal = 0
  let pendingSettlement = 0
  for (const c of commissions) {
    commissionTotal += c.commission_amount
    if (c.status === 'accrued') pendingSettlement += c.commission_amount
  }
  return { commissionTotal, pendingSettlement }
}
