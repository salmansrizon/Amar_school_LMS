import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'

// #528: the static header set is a release gate, so it is pinned. Without this,
// removing includeSubDomains or flipping poweredByHeader back on is a silent
// one-line regression that only a header scanner would ever catch.
async function headerMap() {
  const groups = await nextConfig.headers!()
  const all = groups.flatMap((g) => g.headers)
  return new Map(all.map((h) => [h.key.toLowerCase(), h.value]))
}

describe('static security headers', () => {
  it('stops advertising the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })

  it('applies to every route, not just pages', async () => {
    const groups = await nextConfig.headers!()
    expect(groups.some((g) => g.source === '/(.*)')).toBe(true)
  })

  // ASVS 5.0 V3.4.1 wants >= 1 year AND subdomains. Staging sent max-age with no
  // includeSubDomains — and this app is multi-tenant *on* subdomains, so leaving
  // them out excludes every actual school.
  it('covers subdomains with HSTS, because tenants are subdomains', async () => {
    const hsts = (await headerMap()).get('strict-transport-security')!
    expect(hsts).toContain('includeSubDomains')
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)![1])
    expect(maxAge).toBeGreaterThanOrEqual(31536000)
  })

  it('ships clickjacking protection enforced, since frame-ancestors is inert in report-only', async () => {
    const map = await headerMap()
    expect(map.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(map.get('x-frame-options')).toBe('DENY')
  })

  it('names a reporting endpoint, or the report-to directive does nothing', async () => {
    expect((await headerMap()).get('reporting-endpoints')).toContain('csp-endpoint')
  })

  it('keeps referrers and MIME sniffing closed', async () => {
    const map = await headerMap()
    expect(map.get('x-content-type-options')).toBe('nosniff')
    expect(map.get('referrer-policy')).toBe('same-origin')
    expect(map.get('cross-origin-opener-policy')).toBe('same-origin')
  })
})
