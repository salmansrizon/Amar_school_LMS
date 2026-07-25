// The super-admin schools-manager read model (map #171 T4; the extraction the
// arch review deferred to "when T4/T10 touch this page"). One deep module owns
// the five queries, the schools_with_code_history uuid-string quirk, the single
// canonical clock, the per-school payment ledger, and the claim-code grouping —
// so schools/page.tsx just calls loadSchoolsManager and renders. The pure
// buildSchoolsManagerViewModel is the test surface.

import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfUtcToday } from '@/lib/subscription'
import { lifecycleStatus, type LifecycleStatus, type SchoolRow } from '@/lib/super-admin/dashboard'
import { perSchoolLedger, lastPaidBySchool, type CodeRow } from '@/lib/super-admin/financials'

export interface SchoolFetchRow {
  id: string
  name: string
  subscription_expires_at: string | null
  subdomain: string | null
  address_line: string | null
  mobile: string | null
  email: string | null
  eiin_no: string | null
  deactivated_at: string | null
}

export interface ClaimCode {
  code: string
  redeemed_at: string | null
}

export interface SchoolsManagerData {
  schools: SchoolFetchRow[]
  /** schools_with_code_history → setof uuid → bare id strings. */
  history: string[]
  /** profiles rows for role=school_owner (school_id each). */
  owners: { school_id: string }[]
  claimCodes: { code: string; school_id: string; redeemed_at: string | null }[]
  codes: CodeRow[]
}

/** One school, fully shaped for its card: status (incl. paused), payment ledger,
 *  owner presence, and its claim codes. */
export interface SchoolCard {
  id: string
  name: string
  subscriptionExpiresAt: string | null
  subdomain: string | null
  header: { address_line: string | null; mobile: string | null; email: string | null; eiin_no: string | null }
  /** trial | active | expired | blocked — 'blocked' surfaces as "paused". */
  status: LifecycleStatus
  hasOwner: boolean
  monthsPaid: number
  totalPaid: number
  lastPaid: number | null
  claimCodes: ClaimCode[]
}

/** Pure: shape the five row sets into per-school cards. Owns the uuid-string Set
 *  membership, the lifecycle classification, the ledger + last-paid lookups, and
 *  the claim-code grouping — none of which the component should re-encode. */
export function buildSchoolsManagerViewModel(data: SchoolsManagerData, today: Date): SchoolCard[] {
  const withHistory = new Set(data.history)
  const withOwner = new Set(data.owners.map((o) => o.school_id))
  const ledger = new Map(perSchoolLedger(data.codes).map((e) => [e.schoolId, e]))
  const lastPaid = lastPaidBySchool(data.codes)

  const codesBySchool = new Map<string, ClaimCode[]>()
  for (const c of data.claimCodes) {
    const list = codesBySchool.get(c.school_id) ?? []
    list.push({ code: c.code, redeemed_at: c.redeemed_at })
    codesBySchool.set(c.school_id, list)
  }

  return data.schools.map((s) => {
    const row: SchoolRow = {
      id: s.id,
      name: s.name,
      subscription_expires_at: s.subscription_expires_at,
      deactivated_at: s.deactivated_at,
      hasCodeHistory: withHistory.has(s.id),
    }
    const paid = ledger.get(s.id)
    return {
      id: s.id,
      name: s.name,
      subscriptionExpiresAt: s.subscription_expires_at,
      subdomain: s.subdomain,
      header: { address_line: s.address_line, mobile: s.mobile, email: s.email, eiin_no: s.eiin_no },
      status: lifecycleStatus(row, today),
      hasOwner: withOwner.has(s.id),
      monthsPaid: paid?.monthsPaid ?? 0,
      totalPaid: paid?.totalPaid ?? 0,
      lastPaid: lastPaid.get(s.id) ?? null,
      claimCodes: codesBySchool.get(s.id) ?? [],
    }
  })
}

/** Thin IO wrapper: run the five queries, hand off to the pure builder with the
 *  canonical clock (UTC-midnight, shared with the rest of the super-admin area). */
export async function loadSchoolsManager(supabase: SupabaseClient): Promise<SchoolCard[]> {
  const [{ data: schools }, { data: history }, { data: owners }, { data: claimCodes }, { data: codes }] =
    await Promise.all([
      supabase
        .from('schools')
        .select('id, name, subscription_expires_at, subdomain, address_line, mobile, email, eiin_no, deactivated_at')
        .order('name'),
      supabase.rpc('schools_with_code_history'),
      supabase.from('profiles').select('school_id').eq('role', 'school_owner'),
      supabase
        .from('school_claim_codes')
        .select('code, school_id, redeemed_at')
        .order('created_at', { ascending: false }),
      supabase.from('subscription_codes').select('price, redeemed_at, redeemed_school_id'),
    ])
  return buildSchoolsManagerViewModel(
    {
      schools: (schools ?? []) as SchoolFetchRow[],
      history: (history ?? []) as string[],
      owners: (owners ?? []) as { school_id: string }[],
      claimCodes: (claimCodes ?? []) as { code: string; school_id: string; redeemed_at: string | null }[],
      codes: (codes ?? []) as CodeRow[],
    },
    startOfUtcToday(),
  )
}
