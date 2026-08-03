// General Ledger implementation (map #258, #266). Thin client over gl_post:
// balanced double-entry, immutable, idempotent on ref. Amounts are integer minor
// units (poisha). Every money flow in later slices posts through here.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GeneralLedger } from './index'

export interface LedgerLine {
  accountCode: string
  debit: number
  credit: number
}

/** Post a balanced journal entry (sum debits === sum credits). Returns the
 * entry id; a repeat ref returns the existing entry (idempotent). */
export async function postLedgerEntry(
  client: SupabaseClient,
  input: { ref: string; memo: string; schoolId: string | null; lines: LedgerLine[] },
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('gl_post', {
    p_ref: input.ref,
    p_memo: input.memo,
    p_lines: input.lines.map((l) => ({ account_code: l.accountCode, debit: l.debit, credit: l.credit })),
    p_school_id: input.schoolId,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`gl_post failed: ${error.message}`)
  return data as string
}

export function createGeneralLedger(client: SupabaseClient, jobSecret?: string): GeneralLedger {
  return {
    postEntry: async (input) => {
      await postLedgerEntry(client, input, jobSecret)
    },
  }
}
