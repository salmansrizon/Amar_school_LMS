import { describe, expect, it, afterEach } from 'vitest'
import { AUTH_COOKIE_NAME, authCookieDomain, authCookieOptions } from '@/lib/auth/cookie-options'

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

describe('authCookieOptions', () => {
  it('always renames the cookie, so a stale host-only session cannot shadow it', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'edumebd.com'
    expect(authCookieOptions('adarshamodelschool.edumebd.com')).toEqual({
      name: AUTH_COOKIE_NAME,
      domain: '.edumebd.com',
      secure: true,
      sameSite: 'lax',
    })
    // Local dev keeps the name but never sets a domain.
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000'
    expect(authCookieOptions('localhost:3000')).toEqual({
      name: AUTH_COOKIE_NAME,
      secure: false,
      sameSite: 'lax',
    })
  })

  // #545: the cookie is deliberately widened to every tenant subdomain, so a
  // missing Secure would let it travel to any of them answering plaintext HTTP.
  // @supabase/ssr's DEFAULT_COOKIE_OPTIONS has no `secure` key, so nothing else
  // supplies it.
  it('marks the session Secure everywhere except loopback', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'edumebd.com'
    expect(authCookieOptions('edumebd.com').secure).toBe(true)
    expect(authCookieOptions('adarshamodelschool.edumebd.com').secure).toBe(true)
    // No root-domain match, but still HTTPS — a preview deploy must stay Secure.
    expect(authCookieOptions('amar-school.vercel.app').secure).toBe(true)
    expect(authCookieOptions(null).secure).toBe(true)

    expect(authCookieOptions('localhost:3000').secure).toBe(false)
    expect(authCookieOptions('127.0.0.1:3000').secure).toBe(false)
    expect(authCookieOptions('school.localhost:3000').secure).toBe(false)
  })

  // An IPv6 Host header is bracketed, so the IPv4 `split(':')[0]` truncates it to
  // '[' and every comparison fails. A dev on http://[::1]:3000 then gets a Secure
  // cookie the browser refuses to store, and cannot log in at all.
  it('recognises bracketed IPv6 loopback', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'edumebd.com'
    expect(authCookieOptions('[::1]:3000').secure).toBe(false)
    expect(authCookieOptions('[::1]').secure).toBe(false)
  })

  it('pins SameSite rather than inheriting it from the library default', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'edumebd.com'
    expect(authCookieOptions('edumebd.com').sameSite).toBe('lax')
    expect(authCookieOptions('localhost:3000').sameSite).toBe('lax')
  })
})
