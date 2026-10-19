import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumnError } from '@/lib/leave-columns'

// Migration 0230 adds fee_collection_records.fee_amount (#678); 0231 adds
// void_at / void_by / void_reason (#683). The app has to work before and after
// each one, in either order, so every fee read and write first asks which of
// the two the database has — one tiny read per column, remembered for a minute
// (same idea as lib/leave-columns.ts and lib/school/attendance-rate-source.ts,
// which retry instead; a probe keeps the fee queries themselves single-shape).

export type FeeColumns = { feeAmount: boolean; void: boolean }

// Short on purpose, both ways: a newly applied migration is picked up within a
// minute, and so is a rolled-back one.
const RECHECK_MS = 60_000
const seen = new Map<string, { present: boolean; at: number }>()

async function hasColumn(supabase: SupabaseClient, column: string): Promise<boolean> {
  const hit = seen.get(column)
  if (hit && Date.now() - hit.at < RECHECK_MS) return hit.present
  const { error } = await supabase.from('fee_collection_records').select(column).limit(1)
  // Any other failure says nothing about the schema: take today's shape and ask again next time.
  if (error && !isMissingColumnError(error)) return false
  seen.set(column, { present: !error, at: Date.now() })
  return !error
}

export async function feeColumns(supabase: SupabaseClient): Promise<FeeColumns> {
  const [feeAmount, voidCols] = await Promise.all([hasColumn(supabase, 'fee_amount'), hasColumn(supabase, 'void_at')])
  return { feeAmount, void: voidCols }
}

/** `base` plus whichever optional columns exist. */
export function feeSelect(base: string, cols: FeeColumns, voidColumns = 'void_at'): string {
  return [base, cols.feeAmount && 'fee_amount', cols.void && voidColumns].filter(Boolean).join(', ')
}
