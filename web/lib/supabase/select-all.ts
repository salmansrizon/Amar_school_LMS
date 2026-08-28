/** The row cap PostgREST applies to a select with no explicit range. */
export const POSTGREST_PAGE_CAP = 1000

/** Read every row of a query, a page at a time.
 *
 *  PostgREST caps an unbounded select at 1000 rows and says nothing about it — no
 *  error, no flag, just a short array. Anything folded from that array is then
 *  wrong in a way that looks like data rather than like a bug. That is exactly how
 *  #530 produced a phantom ৳2,800 ledger imbalance from a perfectly balanced
 *  ledger, and how a UAT pass came to record it as a release blocker.
 *
 *  Where the result is an aggregate, the right answer is to aggregate in the
 *  database (`gl_trial_balance`, `sms_pool_summary`). This is for the other case:
 *  when the caller genuinely needs every row, because it is going to lay them out
 *  — a mark sheet needs one mark per student per subject, and a missing row does
 *  not read as missing, it reads as a zero.
 *
 *  Takes a builder rather than a query, because a Supabase query builder is
 *  single-use: awaiting it once consumes it, so paging has to construct a fresh
 *  one per page.
 *
 *  Stops when a page comes back short, which is the only reliable end signal —
 *  asking for a count first would double the round trips and still race. */
export async function selectAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = POSTGREST_PAGE_CAP,
): Promise<{ rows: T[]; error?: string }> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { rows, error: error.message }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) return { rows }
  }
}
