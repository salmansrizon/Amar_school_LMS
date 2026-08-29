import { describe, expect, it } from 'vitest'
import { NextResponse } from 'next/server'
import { carrySession } from '@/lib/auth/carry-session'

// #545: a session refreshed during proxy() lands on the response that existed at
// that moment. Every redirect builds a new one, so without this move the refresh
// is dropped and the next request arrives with the same stale token.
const REFRESH_HEADERS = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
}

describe('carrySession', () => {
  it('moves the refreshed cookies onto the response actually returned', () => {
    const refreshed = NextResponse.next()
    refreshed.cookies.set('edume-auth', 'fresh-token', { domain: '.edumebd.com', secure: true })

    const redirect = carrySession(refreshed, REFRESH_HEADERS, NextResponse.redirect(new URL('https://edumebd.com/login')))

    expect(redirect.cookies.get('edume-auth')?.value).toBe('fresh-token')
  })

  it('replays every header the library handed setAll, so a CDN cannot cache the Set-Cookie', () => {
    const redirect = carrySession(NextResponse.next(), REFRESH_HEADERS, NextResponse.redirect(new URL('https://edumebd.com/login')))

    expect(redirect.headers.get('cache-control')).toBe(REFRESH_HEADERS['Cache-Control'])
    expect(redirect.headers.get('expires')).toBe('0')
    expect(redirect.headers.get('pragma')).toBe('no-cache')
  })

  // The whole reason this replays the object rather than matching names against a
  // list of its own: a second list is a second place encoding which headers a
  // refresh writes, and it goes stale silently the day the library adds one.
  it('carries a header this code has never heard of', () => {
    const redirect = carrySession(
      NextResponse.next(),
      { ...REFRESH_HEADERS, 'Surrogate-Control': 'no-store' },
      NextResponse.redirect(new URL('https://edumebd.com/login')),
    )

    expect(redirect.headers.get('surrogate-control')).toBe('no-store')
  })

  it('is a no-op when no refresh happened, which is the common request', () => {
    const redirect = carrySession(NextResponse.next(), {}, NextResponse.redirect(new URL('https://edumebd.com/login')))

    expect(redirect.headers.get('cache-control')).toBeNull()
    expect(redirect.cookies.getAll()).toHaveLength(0)
  })
})
