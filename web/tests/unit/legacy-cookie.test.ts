import { describe, expect, it, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { expireLegacySessionCookie } from '@/lib/auth/legacy-cookie'

const REF = 'abcdefgh'
const LEGACY = `sb-${REF}-auth-token`

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${REF}.supabase.co`
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'edumebd.com'
})

function requestWith(cookies: Record<string, string>, host = 'adarshamodelschool.edumebd.com') {
  const req = new NextRequest(`https://${host}/school`, { headers: { host } })
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value)
  return req
}

// Read the raw Set-Cookie lines, not res.cookies: that map is keyed by name and
// would collapse the two scopes this helper deliberately emits separately.
const clearLines = (res: NextResponse) =>
  res.headers.getSetCookie().filter((line) => /Max-Age=0/i.test(line))

const expired = (res: NextResponse) => clearLines(res).map((line) => line.split('=')[0])

describe('expireLegacySessionCookie', () => {
  // The rename means signOut can never reach the old cookie, so it would sit in
  // the browser with its token material for @supabase/ssr's 400-day default.
  it('expires the pre-rename cookie when it is present', () => {
    const res = NextResponse.next()
    expireLegacySessionCookie(requestWith({ [LEGACY]: 'stale-token' }), res)
    expect(expired(res)).toContain(LEGACY)
  })

  // Supabase splits a large session across `<key>.0`, `<key>.1`, … Clearing only
  // the base name leaves the chunks — which are where the token actually is.
  it('expires the chunked parts too, which is where the token lives', () => {
    const res = NextResponse.next()
    expireLegacySessionCookie(requestWith({ [`${LEGACY}.0`]: 'a', [`${LEGACY}.1`]: 'b' }), res)
    expect(expired(res)).toEqual(expect.arrayContaining([`${LEGACY}.0`, `${LEGACY}.1`]))
  })

  // Self-limiting by design: one Set-Cookie per browser, then never again. That is
  // what lets this ship without a removal date or a reminder.
  it('does nothing at all when the stale cookie is absent', () => {
    const res = NextResponse.next()
    expireLegacySessionCookie(requestWith({ 'edume-auth': 'current' }), res)
    expect(expired(res)).toEqual([])
  })

  it('never touches the cookie currently in use', () => {
    const res = NextResponse.next()
    expireLegacySessionCookie(requestWith({ [LEGACY]: 'stale', 'edume-auth': 'current' }), res)
    expect(expired(res)).not.toContain('edume-auth')
  })

  // The app has written both scopes: host-only under the old default, and
  // `.<root>` since the domain widening. A browser ignores a Set-Cookie for a
  // scope it does not own, so clearing both is safe and clearing one is not enough.
  it('clears the domain-wide scope as well as the host-only one', () => {
    const res = NextResponse.next()
    expireLegacySessionCookie(requestWith({ [LEGACY]: 'stale' }), res)
    const lines = clearLines(res).filter((l) => l.startsWith(`${LEGACY}=`))
    // Two separate Set-Cookie lines, because a browser only honours the one whose
    // scope it actually holds — and `main` wrote the host-only one.
    expect(lines).toHaveLength(2)
    expect(lines.some((l) => l.includes('Domain=.edumebd.com'))).toBe(true)
    expect(lines.some((l) => !l.includes('Domain='))).toBe(true)
  })

  it('is inert on a host with no root-domain match, rather than guessing', () => {
    const res = NextResponse.next()
    expireLegacySessionCookie(requestWith({ [LEGACY]: 'stale' }, 'localhost:3000'), res)
    const lines = clearLines(res).filter((l) => l.startsWith(`${LEGACY}=`))
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('Domain=')
  })
})
