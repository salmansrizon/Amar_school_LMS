/** Director Capital figures that add up (#681).
 *
 *  The page showed a stored balance next to invested/withdrawn totals summed
 *  from the listed transactions, with nothing saying how one leads to the
 *  other. The stored balance (`director_capital_balances`, kept by the 0055
 *  trigger) is the source of truth; everything else is derived from it, so
 *
 *      opening + invested − withdrawn = closing
 *
 *  holds on screen for any date range. */

export type CapitalTxn = { txn_type: string; amount: number }

const net = (txns: readonly CapitalTxn[]) =>
  txns.reduce((s, x) => s + (x.txn_type === 'invest' ? x.amount : -x.amount), 0)

/** `inRange` are the transactions the page lists; `sinceFrom` are all of those
 *  plus any dated after the range's end (the same list when there is no end).
 *  Opening is what the balance was before the first listed transaction —
 *  including anything the transaction list cannot account for. */
export function capitalSummary(
  currentBalance: number,
  inRange: readonly CapitalTxn[],
  sinceFrom: readonly CapitalTxn[] = inRange,
): { opening: number; invested: number; withdrawn: number; closing: number } {
  const sum = (k: string) => inRange.filter((x) => x.txn_type === k).reduce((s, x) => s + x.amount, 0)
  const opening = currentBalance - net(sinceFrom)
  return { opening, invested: sum('invest'), withdrawn: sum('withdraw'), closing: opening + net(inRange) }
}
