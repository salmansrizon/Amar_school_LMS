import type { SupabaseClient } from '@supabase/supabase-js'
import { walletBalance } from '@/lib/engines/financial/wallet'

export interface WalletLedgerEntry {
  id: string
  amount: number | null
  reason: string
  created_at: string
}

export interface DistributorWallet {
  balance: number
  entries: WalletLedgerEntry[]
}

// Load a distributor's own wallet balance + recent ledger. RLS scopes both the
// wallets and the ledger to the caller. Single source for the dashboard snapshot
// and the wallet page so the balance can't be derived two different ways.
export async function loadDistributorWallet(
  supabase: SupabaseClient,
  ownerProfileId: string,
  limit = 100,
): Promise<DistributorWallet> {
  const { data: wallets } = await supabase.from('wallets').select('id').eq('owner_profile_id', ownerProfileId)
  const walletIds = (wallets ?? []).map((w) => w.id)
  if (!walletIds.length) return { balance: 0, entries: [] }

  // The comment that used to sit here claimed the balance "can't silently
  // understate past the display window". It could: the sum was an unbounded select,
  // which PostgREST caps at 1000 rows without saying so, and a distributor with a
  // busy wallet would have been shown a balance short by every entry past the cap
  // (#546, same failure as #530).
  //
  // wallet_balance sums in the database, one row out, so there is nothing to
  // truncate. The list below stays capped, because that one really is for display.
  const [balances, entriesRes] = await Promise.all([
    Promise.all(walletIds.map((id) => walletBalance(supabase, id))),
    supabase
      .from('wallet_ledger_entries')
      .select('id, amount, reason, created_at')
      .in('wallet_id', walletIds)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  const balance = balances.reduce((sum, b) => sum + b.amount, 0)
  const entries = (entriesRes.data ?? []) as WalletLedgerEntry[]
  return { balance, entries }
}
