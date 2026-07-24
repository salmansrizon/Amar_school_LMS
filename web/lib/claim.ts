import type { MessageKey } from '@/lib/i18n'

// Map a redeem_school_claim_code error (raised as a Postgres exception message)
// to a user-facing i18n key (issue #112). Keeps the claim UI's error handling
// pure + testable.
export function claimErrorKey(message: string | undefined): MessageKey {
  const m = (message ?? '').toLowerCase()
  if (m.includes('already used') || m.includes('invalid code')) return 'claim.invalidCode'
  // 'subdomain already taken' (pre-check) or a raw unique_violation on a race.
  if (m.includes('subdomain already taken') || m.includes('duplicate key') || m.includes('unique')) {
    return 'claim.slugTaken'
  }
  if (m.includes('invalid subdomain')) return 'claim.slugInvalid'
  if (m.includes('profile already exists')) return 'claim.alreadyOwner'
  return 'claim.failed'
}
