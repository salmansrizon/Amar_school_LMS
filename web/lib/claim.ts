import type { MessageKey } from '@/lib/i18n'

// Map a redeem_school_claim_code error (raised as a Postgres exception message)
// to a user-facing i18n key (issue #112). Keeps the claim UI's error handling
// pure + testable.
export function claimErrorKey(message: string | undefined): MessageKey {
  const m = (message ?? '').toLowerCase()
  if (m.includes('already used') || m.includes('invalid code')) return 'claim.invalidCode'
  if (m.includes('subdomain already taken')) return 'claim.slugTaken'
  if (m.includes('invalid subdomain')) return 'claim.slugInvalid'
  if (m.includes('profile already exists')) return 'claim.alreadyOwner'
  return 'claim.failed'
}
