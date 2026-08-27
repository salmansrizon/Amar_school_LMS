import { describe, expect, it, afterEach } from 'vitest'
import { authCookieDomain } from '@/lib/auth/cookie-domain'

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN

afterEach(() => {
  if (ROOT === undefined) delete process.env.NEXT_PUBLIC_ROOT_DOMAIN
  else process.env.NEXT_PUBLIC_ROOT_DOMAIN = ROOT
})

describe('authCookieDomain', () => {
  it('spans the apex and its tenant subdomains', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'edumebd.com'
    expect(authCookieDomain('edumebd.com')).toBe('.edumebd.com')
    expect(authCookieDomain('adarshamodelschool.edumebd.com')).toBe('.edumebd.com')
    expect(authCookieDomain('EDUMEBD.COM:443')).toBe('.edumebd.com')
  })

  it('leaves everything else host-only', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'edumebd.com'
    expect(authCookieDomain('amar-school.vercel.app')).toBeUndefined()
    expect(authCookieDomain('someone-else.com')).toBeUndefined()
    expect(authCookieDomain(null)).toBeUndefined()
  })

  it('is a no-op in local dev, where there is no dotted root', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000'
    expect(authCookieDomain('localhost:3000')).toBeUndefined()
  })
})
