// The super-admin school-detail read model (map #171, arch review round 2). The
// third member of the read-model family (landing, schools list, school detail):
// one deep module owns the detail page's queries, the schools_with_code_history
// uuid-string quirk, the lifecycle classification, the activation-link mapping,
// and the SMS-balance RPC sequencing — so [id]/page.tsx just calls it and
// renders. The pure builder is the test surface.

import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfUtcToday } from '@/lib/subscription'
import { rootDomain } from '@/lib/auth/tenant-host'
import { buildActivationUrl } from '@/lib/super-admin/activation'
import { lifecycleStatus, type LifecycleStatus, type SchoolRow } from '@/lib/super-admin/dashboard'

export interface SchoolDetailRow {
  id: string
  name: string
  subscription_expires_at: string | null
  deactivated_at: string | null
  subdomain: string | null
}

/** One sms_credit_ledger row as the detail page shows it. */
export interface LedgerEntry {
  delta: number
  reason: 'topup' | 'send' | 'adjust'
  amount: number | null
  note: string | null
  created_at: string
}

export interface SchoolDetailData {
  school: SchoolDetailRow
  /** schools_with_code_history → setof uuid → bare id strings. */
  history: string[]
  claimCodes: { code: string; redeemed_at: string | null }[]
  flags: { flag_key: string }[]
  ledger: LedgerEntry[]
}

export interface ActivationLink {
  code: string
  url: string
}

export interface SchoolDetailViewModel {
  id: string
  name: string
  subscriptionExpiresAt: string | null
  subdomain: string | null
  blocked: boolean
  status: LifecycleStatus
  activationLinks: ActivationLink[]
  enabledFlags: string[]
  ledger: LedgerEntry[]
}

/** Pure: shape the detail rows into the view model. Owns the uuid-string history
 *  join, the lifecycle classification, and the unredeemed-code → activation-link
 *  mapping (built against the passed root domain to stay pure). */
export function buildSchoolDetailViewModel(
  data: SchoolDetailData,
  today: Date,
  root: string,
): SchoolDetailViewModel {
  const { school } = data
  const row: SchoolRow = {
    id: school.id,
    name: school.name,
    subscription_expires_at: school.subscription_expires_at,
    deactivated_at: school.deactivated_at,
    hasCodeHistory: new Set(data.history).has(school.id),
  }
  return {
    id: school.id,
    name: school.name,
    subscriptionExpiresAt: school.subscription_expires_at,
    subdomain: school.subdomain,
    blocked: school.deactivated_at !== null,
    status: lifecycleStatus(row, today),
    activationLinks: data.claimCodes
      .filter((c) => c.redeemed_at === null)
      .map((c) => ({ code: c.code, url: buildActivationUrl(root, c.code) })),
    enabledFlags: data.flags.map((f) => f.flag_key),
    ledger: data.ledger,
  }
}

/** Thin IO wrapper: run the detail queries + the authoritative balance RPC (the
 *  ledger grows a row per send — never sum the 10-row display slice), then hand
 *  off to the pure builder. Returns null when the school does not exist. */
export async function loadSchoolDetail(
  supabase: SupabaseClient,
  id: string,
): Promise<(SchoolDetailViewModel & { smsBalance: number }) | null> {
  const [{ data: school }, { data: history }, { data: codes }, { data: flags }, { data: ledger }] =
    await Promise.all([
      supabase
        .from('schools')
        .select('id, name, subscription_expires_at, deactivated_at, subdomain')
        .eq('id', id)
        .maybeSingle(),
      supabase.rpc('schools_with_code_history'),
      supabase.from('school_claim_codes').select('code, redeemed_at').eq('school_id', id).order('created_at', { ascending: false }),
      supabase.from('school_feature_flags').select('flag_key').eq('school_id', id).eq('enabled', true),
      supabase
        .from('sms_credit_ledger')
        .select('delta, reason, amount, note, created_at')
        .eq('school_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])
  if (!school) return null

  const { data: balance } = await supabase.rpc('sms_balance_for', { sid: id })
  const vm = buildSchoolDetailViewModel(
    {
      school: school as SchoolDetailRow,
      history: (history ?? []) as string[],
      claimCodes: (codes ?? []) as { code: string; redeemed_at: string | null }[],
      flags: (flags ?? []) as { flag_key: string }[],
      ledger: (ledger ?? []) as LedgerEntry[],
    },
    startOfUtcToday(),
    rootDomain(),
  )
  return { ...vm, smsBalance: (balance as number | null) ?? 0 }
}
