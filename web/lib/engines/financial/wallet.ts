// Wallet primitive implementation (map #258, #265). Thin client over the wallet
// definer RPCs (ensure/post/balance) — append-only, idempotent on (wallet, ref),
// dual money(minor units)/quantity ledger. Reused by SMS Commerce (#268) and the
// Financial Engine (#266).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WalletEngine, WalletLedgerEntry, WalletType } from './index'

interface EnsureInput {
  walletType: WalletType
  schoolId?: string | null
  profileId?: string | null
}

/** Find or create a wallet of a type for an owner (company when both null). */
export async function ensureWallet(
  client: SupabaseClient,
  input: EnsureInput,
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('wallet_ensure', {
    p_wallet_type: input.walletType,
    p_school_id: input.schoolId ?? null,
    p_profile_id: input.profileId ?? null,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`wallet_ensure failed: ${error.message}`)
  return data as string
}

/** Append an idempotent ledger entry; returns the entry id. */
export async function postToWallet(
  client: SupabaseClient,
  entry: WalletLedgerEntry,
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('wallet_post', {
    p_wallet_id: entry.walletId,
    p_ref: entry.ref,
    p_reason: entry.reason,
    p_amount: entry.amount,
    p_quantity: entry.quantity,
    p_route: entry.route,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`wallet_post failed: ${error.message}`)
  return data as string
}

/** Current balance (money minor units + quantity) for a readable wallet. */
export async function walletBalance(
  client: SupabaseClient,
  walletId: string,
): Promise<{ amount: number; quantity: number }> {
  const { data, error } = await client.rpc('wallet_balance', { p_wallet_id: walletId })
  if (error) throw new Error(`wallet_balance failed: ${error.message}`)
  const row = (data as { amount: number; quantity: number }[] | null)?.[0]
  return { amount: Number(row?.amount ?? 0), quantity: Number(row?.quantity ?? 0) }
}

export function createWalletEngine(client: SupabaseClient, jobSecret?: string): WalletEngine {
  return {
    balance: (walletId) => walletBalance(client, walletId),
    post: async (entry) => {
      await postToWallet(client, entry, jobSecret)
    },
  }
}
