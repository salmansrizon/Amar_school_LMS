import type { SupabaseClient } from '@supabase/supabase-js'

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

  // Balance sums EVERY entry; the returned list is capped for display only, so
  // the balance can't silently understate past the display window.
  const [balanceRes, entriesRes] = await Promise.all([
    supabase.from('wallet_ledger_entries').select('amount').in('wallet_id', walletIds),
    supabase
      .from('wallet_ledger_entries')
      .select('id, amount, reason, created_at')
      .in('wallet_id', walletIds)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  const balance = (balanceRes.data ?? []).reduce((s, e) => s + (e.amount ?? 0), 0)
  const entries = (entriesRes.data ?? []) as WalletLedgerEntry[]
  return { balance, entries }
}
