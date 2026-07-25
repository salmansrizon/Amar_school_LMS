// Owner-claim activation link (map #158, ticket #161). The super-admin mints a
// claim code (generate_school_claim_code); the owner activates their school by
// visiting the apex /claim page, which prefills the code from the query string.
// Pure so the URL shape is unit-testable without a request context.

/** The apex activation URL carrying the claim code, e.g.
 *  `https://amarschool.com/claim?code=ABC123`. Always https + apex host (the
 *  owner has no subdomain yet — they pick it during claim). */
export function buildActivationUrl(rootDomain: string, code: string): string {
  return `https://${rootDomain}/claim?code=${encodeURIComponent(code)}`
}
