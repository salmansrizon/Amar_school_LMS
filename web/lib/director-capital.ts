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

/** The balance after each listed transaction, in the order given, starting
 *  from the range's opening balance (#681). The table used to print the stored
 *  `balance_after`, which was stamped in the order rows were entered and carries
 *  whatever the balance held at that moment: with a back-dated entry, or a
 *  balance the transactions do not explain, the column disagreed with the cards
 *  above it (a first row of ৳3,30,500 with no opening shown). Derived from the
 *  same opening figure, the last row always equals the closing card. Summed in
 *  whole poisha so decimals never drift. */
export function capitalRunningBalances(opening: number, txns: readonly CapitalTxn[]): number[] {
  let poisha = Math.round(opening * 100)
  return txns.map((x) => {
    poisha += Math.round(x.amount * 100) * (x.txn_type === 'invest' ? 1 : -1)
    return poisha / 100
  })
}
