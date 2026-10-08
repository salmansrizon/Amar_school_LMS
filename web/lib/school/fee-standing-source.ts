import type { SupabaseClient } from '@supabase/supabase-js'
import { feeStanding, type FeeStanding } from '@/lib/fees'
import { feeColumns } from '@/lib/fee-columns'

// Monthly Fee Standing for every Student the caller can read, for one month.
// One Fee Collection Record per Student per month, so a school's month is at
// most a couple of 1000-row pages (the REST cap, see lib/locations-server.ts).
const PAGE = 1000

export async function monthlyFeeStandings(
  supabase: SupabaseClient,
  month: number,
  year: number,
): Promise<Map<string, { standing: FeeStanding; due: number }>> {
  const out = new Map<string, { standing: FeeStanding; due: number }>()
  // A voided record (#683, 0231) is not a standing: the month reads as not billed.
  const skipVoided = (await feeColumns(supabase)).void
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('fee_collection_records')
      .select('student_id, pay_amount, due_amount')
      .eq('month', month)
      .eq('year', year)
    if (skipVoided) query = query.is('void_at', null)
    const { data } = await query.order('student_id').range(from, from + PAGE - 1)
    for (const r of data ?? []) {
      const rec = { pay_amount: Number(r.pay_amount), due_amount: Number(r.due_amount) }
      const standing = feeStanding(rec)
      if (standing) out.set(r.student_id, { standing, due: rec.due_amount })
    }
    if (!data || data.length < PAGE) break
  }
  return out
}
